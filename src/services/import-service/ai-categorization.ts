import { and, asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { defaultLocale, type Locale } from "@/lib/i18n/locale";
import { importBatches, importItems } from "@/db/schema";
import { getDefaultCategory } from "@/services/categorization-service/default-category";
import {
  createAiCategoryEnrichmentService,
  isAiCategorySuggestionCurrent,
  isAiCategorySuggestionStale,
  type AiCategorizationRuntimeResolver,
} from "@/services/ai-categorization-service";
import { createCategorizationService } from "@/services/categorization-service";
import { ImportServiceError } from "@/services/import-service/error";
import { storedNormalizedSchema } from "@/services/import-service/schema";
import type { NormalizedImportTransaction } from "@/services/import-service/types";

export function createImportAiCategorizationWorkflow(
  database: Database,
  runtimeFor: AiCategorizationRuntimeResolver,
) {
  const categorization = createCategorizationService(database);

  function assertEditableBatch(userId: string, batchId: string) {
    const batch = database
      .select({ status: importBatches.status })
      .from(importBatches)
      .where(
        and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)),
      )
      .get();
    if (!batch) {
      throw new ImportServiceError("BATCH_NOT_FOUND", "Import batch not found", 404);
    }
    if (batch.status !== "reviewing") {
      throw new ImportServiceError(
        "BATCH_NOT_EDITABLE",
        "Import batch is no longer editable",
        409,
      );
    }
  }

  function getOtherCategory(userId: string) {
    return getDefaultCategory(database, userId, "other");
  }

  function listCandidates(
    userId: string,
    batchId: string,
    configurationFingerprint: string,
  ) {
    const otherCategory = getOtherCategory(userId);
    return database
      .select()
      .from(importItems)
      .where(
        and(eq(importItems.userId, userId), eq(importItems.batchId, batchId)),
      )
      .orderBy(asc(importItems.rowNumber))
      .all()
      .flatMap((item) => {
        const parsed = storedNormalizedSchema.safeParse(item.normalizedData);
        const localSuggestion =
          parsed.success && parsed.data.type
            ? categorization.suggest({
                userId,
                type: parsed.data.type,
                merchantName: parsed.data.merchantName,
                description: parsed.data.description,
              })
            : null;
        const resolvedByLocalRule =
          localSuggestion &&
          (localSuggestion.ruleSource === "merchant_rule" ||
            localSuggestion.ruleSource === "keyword") &&
          localSuggestion.categoryId ===
            (parsed.success ? parsed.data.categoryId : null);
        const storedSuggestion = parsed.success
          ? parsed.data.categorySuggestion
          : undefined;
        const staleSuggestion = isAiCategorySuggestionStale(
          storedSuggestion,
          configurationFingerprint,
        );
        if (
          !parsed.success ||
          !parsed.data.type ||
          item.validationErrors.length ||
          item.decision === "skip" ||
          (storedSuggestion && !staleSuggestion) ||
          resolvedByLocalRule ||
          (parsed.data.categoryId !== null &&
            parsed.data.categoryId !== otherCategory?.id &&
            !staleSuggestion) ||
          (!parsed.data.merchantName && !parsed.data.description)
        ) {
          return [];
        }
        return [
          {
            row: item,
            candidate: {
              itemRef: item.id,
              type: parsed.data.type,
              source: parsed.data.source,
              merchantName: parsed.data.merchantName,
              description: parsed.data.description,
            },
          },
        ];
      });
  }

  /** `locale`: the language AI reasons are written in (the requester's UI language). */
  async function classifyWithAi(
    userId: string,
    batchId: string,
    locale: Locale = defaultLocale,
  ) {
    assertEditableBatch(userId, batchId);
    const runtime = runtimeFor(userId);
    const pending = listCandidates(
      userId,
      batchId,
      runtime.configurationFingerprint,
    );
    const classified = await createAiCategoryEnrichmentService(
      database,
      runtime,
    ).classify(
      userId,
      pending.map((item) => item.candidate),
      locale,
    );
    if (classified.failed || !classified.enabled) {
      return {
        enabled: classified.enabled,
        failed: classified.failed,
        errorCode: classified.errorCode,
        processed: 0,
        autoApplied: 0,
        needsReview: 0,
        remaining: pending.length,
      };
    }

    let processed = 0;
    let autoApplied = 0;
    let needsReview = 0;
    const otherCategory = getOtherCategory(userId);
    for (const item of pending) {
      const suggestion = classified.suggestions.get(item.row.id);
      if (!suggestion) continue;
      const current = database
        .select({ normalizedData: importItems.normalizedData })
        .from(importItems)
        .where(
          and(
            eq(importItems.id, item.row.id),
            eq(importItems.batchId, batchId),
            eq(importItems.userId, userId),
          ),
        )
        .get();
      const parsed = storedNormalizedSchema.safeParse(current?.normalizedData);
      if (!parsed.success || !parsed.data.type) continue;
      const storedSuggestion = parsed.data.categorySuggestion;
      const staleSuggestion = isAiCategorySuggestionStale(
        storedSuggestion,
        runtime.configurationFingerprint,
      );
      if (storedSuggestion && !staleSuggestion) continue;
      if (
        !isAiCategorySuggestionCurrent(
          suggestion,
          {
            itemRef: item.row.id,
            type: parsed.data.type,
            source: parsed.data.source,
            merchantName: parsed.data.merchantName,
            description: parsed.data.description,
          },
          runtime.configurationFingerprint,
        )
      ) {
        continue;
      }

      const normalizedData: NormalizedImportTransaction = {
        ...parsed.data,
        categoryId:
          suggestion.status === "auto_applied" && suggestion.categoryId
            ? suggestion.categoryId
            : staleSuggestion
              ? otherCategory?.id ?? parsed.data.categoryId
              : parsed.data.categoryId,
        categoryName:
          suggestion.status === "auto_applied" && suggestion.categoryName
            ? suggestion.categoryName
            : staleSuggestion
              ? otherCategory?.name ?? parsed.data.categoryName
              : parsed.data.categoryName,
        categorySuggestion: suggestion,
      };
      database
        .update(importItems)
        .set({
          normalizedData: normalizedData as unknown as Record<string, unknown>,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(importItems.id, item.row.id),
            eq(importItems.batchId, batchId),
            eq(importItems.userId, userId),
          ),
        )
        .run();
      processed += 1;
      if (suggestion.status === "auto_applied") autoApplied += 1;
      else needsReview += 1;
    }

    return {
      enabled: true,
      failed: false,
      errorCode: null,
      processed,
      autoApplied,
      needsReview,
      remaining: listCandidates(
        userId,
        batchId,
        runtime.configurationFingerprint,
      ).length,
    };
  }

  function adoptAiCategorySuggestion(
    userId: string,
    batchId: string,
    itemId: string,
  ) {
    assertEditableBatch(userId, batchId);
    const item = database
      .select()
      .from(importItems)
      .where(
        and(
          eq(importItems.id, itemId),
          eq(importItems.batchId, batchId),
          eq(importItems.userId, userId),
        ),
      )
      .get();
    if (!item) {
      throw new ImportServiceError("ITEM_NOT_FOUND", "Import record not found", 404);
    }
    const parsed = storedNormalizedSchema.safeParse(item.normalizedData);
    const suggestion = parsed.success ? parsed.data.categorySuggestion : null;
    if (
      !parsed.success ||
      !parsed.data.type ||
      !suggestion?.categoryId ||
      !suggestion.categoryName
    ) {
      throw new ImportServiceError(
        "AI_SUGGESTION_NOT_AVAILABLE",
        "This transaction has no adoptable AI category suggestion",
        409,
      );
    }
    if (
      !isAiCategorySuggestionCurrent(
        suggestion,
        {
          itemRef: itemId,
          type: parsed.data.type,
          source: parsed.data.source,
          merchantName: parsed.data.merchantName,
          description: parsed.data.description,
        },
        runtimeFor(userId).configurationFingerprint,
      )
    ) {
      throw new ImportServiceError(
        "AI_SUGGESTION_STALE",
        "Transaction changed. Request a new AI category suggestion",
        409,
      );
    }

    const normalizedData: NormalizedImportTransaction = {
      ...parsed.data,
      categoryId: suggestion.categoryId,
      categoryName: suggestion.categoryName,
      categorySuggestion: { ...suggestion, status: "adopted" },
    };
    database
      .update(importItems)
      .set({
        normalizedData: normalizedData as unknown as Record<string, unknown>,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(importItems.id, itemId),
          eq(importItems.batchId, batchId),
          eq(importItems.userId, userId),
        ),
      )
      .run();
    return { ...item, normalizedData };
  }

  function invalidateStaleSuggestions(
    userId: string,
    batchId: string,
    configurationFingerprint: string,
  ) {
    const items = database
      .select()
      .from(importItems)
      .where(
        and(eq(importItems.userId, userId), eq(importItems.batchId, batchId)),
      )
      .orderBy(asc(importItems.rowNumber))
      .all();
    const parsedItems = items.map((item) => ({
      item,
      parsed: storedNormalizedSchema.safeParse(item.normalizedData),
    }));
    const hasStaleSuggestion = parsedItems.some(
      ({ parsed }) =>
        parsed.success &&
        isAiCategorySuggestionStale(
          parsed.data.categorySuggestion,
          configurationFingerprint,
        ),
    );
    if (!hasStaleSuggestion) return items;

    const otherCategory = getOtherCategory(userId);
    if (!otherCategory) {
      throw new ImportServiceError(
        "CATEGORY_NOT_FOUND",
        "Missing Other category; cannot invalidate old AI suggestions",
        409,
      );
    }
    return parsedItems.map(({ item, parsed }) => {
      if (
        !parsed.success ||
        !isAiCategorySuggestionStale(
          parsed.data.categorySuggestion,
          configurationFingerprint,
        )
      ) {
        return item;
      }
      const normalizedData: NormalizedImportTransaction = {
        ...parsed.data,
        categoryId: otherCategory.id,
        categoryName: otherCategory.name,
      };
      delete normalizedData.categorySuggestion;
      database
        .update(importItems)
        .set({
          normalizedData: normalizedData as unknown as Record<string, unknown>,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(importItems.id, item.id),
            eq(importItems.batchId, batchId),
            eq(importItems.userId, userId),
          ),
        )
        .run();
      return { ...item, normalizedData };
    });
  }

  return {
    classifyWithAi,
    adoptAiCategorySuggestion,
    invalidateStaleSuggestions,
  };
}
