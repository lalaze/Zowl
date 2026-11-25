import { readFileSync } from "node:fs";
import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { categories, merchantCategoryRules, users } from "@/db/schema";
import { defaultCategories } from "@/lib/default-categories";
import { getDefaultCategory } from "./default-category";

it("translates legacy built-ins, preserves references and custom names, and resolves collisions", () => {
  const { db, sqlite } = createDatabase(":memory:");
  const now = "2026-09-23T00:00:00.000Z";
  try {
    migrate(db, { migrationsFolder: path.resolve("drizzle") });
    db.insert(users).values({
      id: "owner", email: "owner@example.com", passwordHash: "test",
      displayName: "Owner", timezone: "Asia/Shanghai", createdAt: now, updatedAt: now,
    }).run();
    // Source-language labels are migration input, as in an existing installation.
    const legacyNames = ["餐饮", "外卖", "交通", "购物", "娱乐", "居住", "医疗", "教育", "数码", "转账", "红包", "工资", "退款", "其他"];
    const builtins = defaultCategories.map((category, index) => ({
      id: `owner:category:${category.key}`, userId: "owner", name: legacyNames[index],
      kind: category.kind, isSystem: true, createdAt: now, updatedAt: now,
    }));
    db.insert(categories).values([
      ...builtins,
      ...["Food", "Food (built-in 1)", "自定义分类"].map((name, index) => ({
        id: `custom-${index}`, userId: "owner", name, kind: "expense" as const,
        isSystem: false, createdAt: now, updatedAt: now,
      })),
    ]).run();
    db.insert(merchantCategoryRules).values({
      id: "rule", userId: "owner", categoryId: "owner:category:food",
      normalizedMerchantName: "cafe", matchType: "exact", createdAt: now, updatedAt: now,
    }).run();

    const migration = readFileSync(path.resolve("drizzle/0017_english_default_categories.sql"), "utf8");
    sqlite.exec(migration);
    const after = db.select().from(categories).all();
    for (const category of defaultCategories) {
      const expectedName = category.key === "food" ? "Food (built-in 2)" : category.names.en;
      expect(getDefaultCategory(db, "owner", category.key)).toMatchObject({
        id: `owner:category:${category.key}`, name: expectedName,
      });
    }
    expect(after.filter((category) => !category.isSystem).map((category) => category.name))
      .toEqual(["Food", "Food (built-in 1)", "自定义分类"]);
    expect(db.select().from(merchantCategoryRules).get()?.categoryId).toBe("owner:category:food");
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
    sqlite.exec(migration);
    expect(db.select().from(categories).all()).toEqual(after);
  } finally {
    sqlite.close();
  }
});

describe("getDefaultCategory", () => {
  const now = "2026-11-15T00:00:00.000Z";

  function withDatabase(run: (db: ReturnType<typeof createDatabase>["db"]) => void) {
    const { db, sqlite } = createDatabase(":memory:");
    try {
      migrate(db, { migrationsFolder: path.resolve("drizzle") });
      db.insert(users).values({
        id: "owner", email: "owner@example.com", passwordHash: "test",
        displayName: "Owner", timezone: "Asia/Shanghai", createdAt: now, updatedAt: now,
      }).run();
      run(db);
    } finally {
      sqlite.close();
    }
  }

  it("finds built-ins by key whatever language they are named in", () => {
    withDatabase((db) => {
      db.insert(categories).values([
        { id: "owner:category:other", userId: "owner", name: "其他", kind: "both", isSystem: true, createdAt: now, updatedAt: now },
        // A custom category with the English name must not win over the built-in.
        { id: "custom-other", userId: "owner", name: "Other", kind: "both", isSystem: false, createdAt: now, updatedAt: now },
      ]).run();

      expect(getDefaultCategory(db, "owner", "other")).toMatchObject({ id: "owner:category:other", name: "其他" });
    });
  });

  it("falls back to a default name in either language for accounts seeded with other ids", () => {
    withDatabase((db) => {
      db.insert(categories).values([
        { id: "category-food", userId: "owner", name: "餐饮", kind: "expense", isSystem: true, createdAt: now, updatedAt: now },
        { id: "category-refund", userId: "owner", name: "Refund", kind: "income", isSystem: true, createdAt: now, updatedAt: now },
      ]).run();

      expect(getDefaultCategory(db, "owner", "food")?.id).toBe("category-food");
      expect(getDefaultCategory(db, "owner", "refund")?.id).toBe("category-refund");
      expect(getDefaultCategory(db, "owner", "other")).toBeUndefined();
    });
  });
});
