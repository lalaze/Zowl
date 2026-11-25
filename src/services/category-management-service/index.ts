import { randomUUID } from "node:crypto";

import { and, asc, count, eq, isNotNull, isNull } from "drizzle-orm";

import { db, type Database } from "@/db/client";
import {
  builtInCategoryKey,
  defaultCategoryForName,
} from "@/lib/default-categories";
import type { Locale } from "@/lib/i18n/locale";
import {
  categories,
  merchantCategoryRules,
  transactions,
} from "@/db/schema";
import {
  categoryNameKey,
  MAX_CATEGORIES_PER_USER,
  type CategoryCreateInput,
  type CategoryUpdateInput,
} from "@/services/category-management-service/schema";

export * from "@/services/category-management-service/schema";

export class CategoryManagementError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "CategoryManagementError";
  }
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("UNIQUE constraint failed") ||
      ("code" in error && error.code === "SQLITE_CONSTRAINT_UNIQUE"))
  );
}

export function createCategoryManagementService(database: Database = db) {
  function getOwnedCategory(userId: string, id: string) {
    return database
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, userId)))
      .get();
  }

  function assertUniqueName(userId: string, name: string, exceptId?: string) {
    const key = categoryNameKey(name);
    const collision = database
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.userId, userId))
      .all()
      .find(
        (category) =>
          category.id !== exceptId && categoryNameKey(category.name) === key,
      );
    if (collision) {
      throw new CategoryManagementError(
        "CATEGORY_NAME_CONFLICT",
        `Category “${name}” already exists`,
        409,
      );
    }
  }

  function usageFor(userId: string, categoryId: string) {
    const transactionCount =
      database
        .select({ value: count() })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.categoryId, categoryId),
            isNull(transactions.voidedAt),
          ),
        )
        .get()?.value ?? 0;
    const ruleCount =
      database
        .select({ value: count() })
        .from(merchantCategoryRules)
        .where(
          and(
            eq(merchantCategoryRules.userId, userId),
            eq(merchantCategoryRules.categoryId, categoryId),
          ),
        )
        .get()?.value ?? 0;
    return { transactionCount, ruleCount };
  }

  function usageMaps(userId: string) {
    const transactionCounts = new Map<string, number>();
    database
      .select({ categoryId: transactions.categoryId, value: count() })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          isNotNull(transactions.categoryId),
          isNull(transactions.voidedAt),
        ),
      )
      .groupBy(transactions.categoryId)
      .all()
      .forEach((row) => {
        if (row.categoryId) transactionCounts.set(row.categoryId, row.value);
      });

    const ruleCounts = new Map<string, number>();
    database
      .select({ categoryId: merchantCategoryRules.categoryId, value: count() })
      .from(merchantCategoryRules)
      .where(eq(merchantCategoryRules.userId, userId))
      .groupBy(merchantCategoryRules.categoryId)
      .all()
      .forEach((row) => ruleCounts.set(row.categoryId, row.value));

    return { transactionCounts, ruleCounts };
  }

  function list(userId: string) {
    const items = database
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(asc(categories.sortOrder), asc(categories.name))
      .all();
    if (!items.length) return [];
    const { transactionCounts, ruleCounts } = usageMaps(userId);
    return items.map((category) => ({
      ...category,
      builtInKey: builtInCategoryKey(userId, category),
      transactionCount: transactionCounts.get(category.id) ?? 0,
      ruleCount: ruleCounts.get(category.id) ?? 0,
    }));
  }

  /**
   * Built-ins that still carry the other language's default name (as seeded,
   * never renamed) and the name they would get in `locale`. A target name
   * already used by another of the user's categories is a conflict.
   */
  function builtInRenames(userId: string, locale: Locale) {
    const other: Locale = locale === "zh" ? "en" : "zh";
    const owned = database
      .select({ id: categories.id, name: categories.name, isSystem: categories.isSystem })
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(asc(categories.sortOrder), asc(categories.name))
      .all();
    return owned.flatMap((category) => {
      const definition = defaultCategoryForName(category.name);
      if (!category.isSystem || definition?.names[other] !== category.name) return [];
      const name = definition.names[locale];
      const conflict = owned.some(
        (candidate) =>
          candidate.id !== category.id &&
          categoryNameKey(candidate.name) === categoryNameKey(name),
      );
      return [{ id: category.id, name, conflict }];
    });
  }

  function builtInNameStatus(userId: string, locale: Locale) {
    const renames = builtInRenames(userId, locale);
    return {
      locale,
      renamable: renames.filter((rename) => !rename.conflict).length,
      conflicting: renames.filter((rename) => rename.conflict).length,
    };
  }

  /** Gives untouched built-ins their `locale` name; user-chosen names are never touched. */
  function applyBuiltInNames(userId: string, locale: Locale) {
    const { renamed, skipped } = database.transaction((tx) => {
      const renames = builtInRenames(userId, locale);
      const now = new Date().toISOString();
      for (const rename of renames) {
        if (rename.conflict) continue;
        tx.update(categories)
          .set({ name: rename.name, updatedAt: now })
          .where(and(eq(categories.id, rename.id), eq(categories.userId, userId)))
          .run();
      }
      return {
        renamed: renames.filter((rename) => !rename.conflict).length,
        skipped: renames.filter((rename) => rename.conflict).length,
      };
    });
    return {
      renamed,
      skipped,
      categories: list(userId),
      rules: listMerchantRules(userId),
    };
  }

  function create(userId: string, input: CategoryCreateInput) {
    const categoryCount =
      database
        .select({ value: count() })
        .from(categories)
        .where(eq(categories.userId, userId))
        .get()?.value ?? 0;
    if (categoryCount >= MAX_CATEGORIES_PER_USER) {
      throw new CategoryManagementError(
        "CATEGORY_LIMIT_REACHED",
        `Each account supports up to ${MAX_CATEGORIES_PER_USER} categories`,
        409,
      );
    }
    assertUniqueName(userId, input.name);
    const maximum = database
      .select({ sortOrder: categories.sortOrder })
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(asc(categories.sortOrder))
      .all()
      .at(-1)?.sortOrder;
    const now = new Date().toISOString();
    const id = randomUUID();
    try {
      database
        .insert(categories)
        .values({
          id,
          userId,
          ...input,
          isSystem: false,
          sortOrder: (maximum ?? -1) + 1,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new CategoryManagementError(
          "CATEGORY_NAME_CONFLICT",
          `Category “${input.name}” already exists`,
          409,
        );
      }
      throw error;
    }
    return { ...getOwnedCategory(userId, id)!, ...usageFor(userId, id) };
  }

  function update(userId: string, id: string, input: CategoryUpdateInput) {
    const current = getOwnedCategory(userId, id);
    if (!current) {
      throw new CategoryManagementError(
        "CATEGORY_NOT_FOUND",
        "Category not found",
        404,
      );
    }
    if (input.name !== undefined) {
      if (current.isSystem && input.name !== current.name) {
        throw new CategoryManagementError(
          "SYSTEM_CATEGORY_NAME_IMMUTABLE",
          "Built-in category names cannot be edited; they switch between English and Chinese on the Categories page. Icons and colors are editable",
          409,
        );
      }
      assertUniqueName(userId, input.name, id);
    }
    if (input.kind !== undefined && input.kind !== current.kind) {
      if (current.isSystem) {
        throw new CategoryManagementError(
          "SYSTEM_CATEGORY_KIND_IMMUTABLE",
          "Built-in category types cannot be changed. Icons and colors are editable",
          409,
        );
      }
      const usage = usageFor(userId, id);
      if (usage.transactionCount > 0 || usage.ruleCount > 0) {
        throw new CategoryManagementError(
          "CATEGORY_KIND_IN_USE",
          `This category is still used by ${usage.transactionCount} transactions and ${usage.ruleCount} learning rules; its type cannot be changed`,
          409,
        );
      }
    }
    try {
      database
        .update(categories)
        .set({ ...input, updatedAt: new Date().toISOString() })
        .where(and(eq(categories.id, id), eq(categories.userId, userId)))
        .run();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new CategoryManagementError(
          "CATEGORY_NAME_CONFLICT",
          `Category “${input.name ?? current.name}” already exists`,
          409,
        );
      }
      throw error;
    }
    return { ...getOwnedCategory(userId, id)!, ...usageFor(userId, id) };
  }

  function reorder(userId: string, ids: string[]) {
    const ownedIds = database
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.userId, userId))
      .all()
      .map((row) => row.id);
    const owned = new Set(ownedIds);
    if (
      ownedIds.length !== ids.length ||
      ids.some((id) => !owned.has(id))
    ) {
      throw new CategoryManagementError(
        "INVALID_CATEGORY_ORDER",
        "The order no longer matches current categories. Refresh and try again",
        409,
      );
    }
    const now = new Date().toISOString();
    database.transaction((tx) => {
      ids.forEach((id, sortOrder) => {
        tx.update(categories)
          .set({ sortOrder, updatedAt: now })
          .where(and(eq(categories.id, id), eq(categories.userId, userId)))
          .run();
      });
    });
    return list(userId);
  }

  function remove(userId: string, id: string) {
    const current = getOwnedCategory(userId, id);
    if (!current) {
      throw new CategoryManagementError(
        "CATEGORY_NOT_FOUND",
        "Category not found",
        404,
      );
    }
    if (current.isSystem) {
      throw new CategoryManagementError(
        "SYSTEM_CATEGORY_DELETE_FORBIDDEN",
        "Built-in categories support automatic categorization. Edit icons and colors, but do not delete them",
        409,
      );
    }
    const usage = usageFor(userId, id);
    if (usage.transactionCount > 0) {
      throw new CategoryManagementError(
        "CATEGORY_IN_USE",
        `There are still ${usage.transactionCount} transactions use this category. Move or uncategorize them first`,
        409,
      );
    }
    const deleted = database
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, userId)))
      .returning({ id: categories.id })
      .all();
    if (deleted.length !== 1) {
      throw new CategoryManagementError(
        "CATEGORY_NOT_FOUND",
        "Category not found",
        404,
      );
    }
    return { id, removedRuleCount: usage.ruleCount };
  }

  function listMerchantRules(userId: string) {
    return database
      .select({
        id: merchantCategoryRules.id,
        normalizedMerchantName: merchantCategoryRules.normalizedMerchantName,
        matchType: merchantCategoryRules.matchType,
        categoryId: merchantCategoryRules.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        createdAt: merchantCategoryRules.createdAt,
        updatedAt: merchantCategoryRules.updatedAt,
      })
      .from(merchantCategoryRules)
      .innerJoin(
        categories,
        and(
          eq(merchantCategoryRules.categoryId, categories.id),
          eq(categories.userId, userId),
        ),
      )
      .where(eq(merchantCategoryRules.userId, userId))
      .orderBy(
        asc(merchantCategoryRules.normalizedMerchantName),
        asc(merchantCategoryRules.createdAt),
      )
      .all();
  }

  function removeMerchantRule(userId: string, id: string) {
    const deleted = database
      .delete(merchantCategoryRules)
      .where(
        and(
          eq(merchantCategoryRules.id, id),
          eq(merchantCategoryRules.userId, userId),
        ),
      )
      .returning({ id: merchantCategoryRules.id })
      .all();
    if (deleted.length !== 1) {
      throw new CategoryManagementError(
        "MERCHANT_RULE_NOT_FOUND",
        "Merchant learning rule not found",
        404,
      );
    }
    return { id };
  }

  return {
    list,
    builtInNameStatus,
    applyBuiltInNames,
    create,
    update,
    reorder,
    remove,
    listMerchantRules,
    removeMerchantRule,
  };
}

export const categoryManagementService = createCategoryManagementService();
