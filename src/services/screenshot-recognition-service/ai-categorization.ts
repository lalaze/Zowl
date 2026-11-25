import { and, asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { recognitionItems, recognitionJobs } from "@/db/schema";
import { getDefaultCategory } from "@/services/categorization-service/default-category";
import { categoryKindSupportsTransaction } from "@/lib/category-kind";
import { defaultLocale, type Locale } from "@/lib/i18n/locale";
import {
  createAiCategoryEnrichmentService,
  isAiCategorySuggestionCurrent,
  isAiCategorySuggestionStale,
  type AiCategorizationRuntimeResolver,
} from "@/services/ai-categorization-service";
import { createCategorizationService } from "@/services/categorization-service";
import { findSuggestedCategory } from "@/services/screenshot-recognition-service/data";
import { ScreenshotRecognitionServiceError } from "@/services/screenshot-recognition-service/error";
import {
  stagedReceiptDataSchema,
  type StagedReceiptData,
} from "@/services/screenshot-recognition-service/schema";

export function createScreenshotAiCategorizationWorkflow(
  database: Database,
  runtimeFor: AiCategorizationRuntimeResolver,
) {
  const categorization = createCategorizationService(database);

  function assertEditableJob(userId: string, jobId: string) {
    const job = database
      .select({ status: recognitionJobs.status })
      .from(recognitionJobs)
      .where(
        and(eq(recognitionJobs.id, jobId), eq(recognitionJobs.userId, userId)),
      )
      .get();
    if (!job) {
      throw new ScreenshotRecognitionServiceError(
        "RECOGNITION_JOB_NOT_FOUND",
        "Recognition task not found",
        404,
      );
    }
    if (job.status !== "reviewing") {
      throw new ScreenshotRecognitionServiceError(
        "RECOGNITION_JOB_NOT_EDITABLE",
        "This recognition task cannot be edited",
        409,
      );
    }
  }

  function listCandidates(
    userId: string,
    jobId: string,
    configurationFingerprint: string,
  ) {
    const otherCategory = getDefaultCategory(database, userId, "other");
    return database
      .select()
      .from(recognitionItems)
      .where(
        and(
          eq(recognitionItems.userId, userId),
          eq(recognitionItems.jobId, jobId),
        ),
      )
      .orderBy(asc(recognitionItems.position))
      .all()
      .flatMap((item) => {
        const parsed = stagedReceiptDataSchema.safeParse(item.normalizedData);
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
        const providerSuggestion = parsed.success
          ? findSuggestedCategory(database, userId, parsed.data.suggestedCategory)
          : null;
        const resolvedByScreenshotProvider =
          parsed.success &&
          parsed.data.type &&
          providerSuggestion &&
          categoryKindSupportsTransaction(
            providerSuggestion.kind,
            parsed.data.type,
          ) &&
          providerSuggestion.id === parsed.data.categoryId;
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
          item.status !== "recognized" ||
          item.decision === "skip" ||
          (storedSuggestion && !staleSuggestion) ||
          resolvedByLocalRule ||
          (resolvedByScreenshotProvider && !staleSuggestion) ||
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
              source: "screenshot" as const,
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
    jobId: string,
    locale: Locale = defaultLocale,
  ) {
    assertEditableJob(userId, jobId);
    const runtime = runtimeFor(userId);
    const pending = listCandidates(
      userId,
      jobId,
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
    const otherCategory = getDefaultCategory(database, userId, "other");
    for (const item of pending) {
      const suggestion = classified.suggestions.get(item.row.id);
      if (!suggestion) continue;
      const current = database
        .select({ normalizedData: recognitionItems.normalizedData })
        .from(recognitionItems)
        .where(
          and(
            eq(recognitionItems.id, item.row.id),
            eq(recognitionItems.jobId, jobId),
            eq(recognitionItems.userId, userId),
          ),
        )
        .get();
      const parsed = stagedReceiptDataSchema.safeParse(current?.normalizedData);
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
            source: "screenshot",
            merchantName: parsed.data.merchantName,
            description: parsed.data.description,
          },
          runtime.configurationFingerprint,
        )
      ) {
        continue;
      }

      const normalizedData: StagedReceiptData = {
        ...parsed.data,
        categoryId:
          suggestion.status === "auto_applied" && suggestion.categoryId
            ? suggestion.categoryId
            : staleSuggestion
              ? otherCategory?.id ?? parsed.data.categoryId
              : parsed.data.categoryId,
        categorySuggestion: suggestion,
      };
      database
        .update(recognitionItems)
        .set({ normalizedData, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(recognitionItems.id, item.row.id),
            eq(recognitionItems.jobId, jobId),
            eq(recognitionItems.userId, userId),
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
        jobId,
        runtime.configurationFingerprint,
      ).length,
    };
  }

  function adoptAiCategorySuggestion(
    userId: string,
    jobId: string,
    itemId: string,
  ) {
    assertEditableJob(userId, jobId);
    const item = database
      .select()
      .from(recognitionItems)
      .where(
        and(
          eq(recognitionItems.id, itemId),
          eq(recognitionItems.jobId, jobId),
          eq(recognitionItems.userId, userId),
        ),
      )
      .get();
    if (!item) {
      throw new ScreenshotRecognitionServiceError(
        "RECOGNITION_ITEM_NOT_FOUND",
        "Recognition item not found",
        404,
      );
    }
    const parsed = stagedReceiptDataSchema.safeParse(item.normalizedData);
    const suggestion = parsed.success ? parsed.data.categorySuggestion : null;
    if (
      !parsed.success ||
      !parsed.data.type ||
      !suggestion?.categoryId ||
      !suggestion.categoryName
    ) {
      throw new ScreenshotRecognitionServiceError(
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
          source: "screenshot",
          merchantName: parsed.data.merchantName,
          description: parsed.data.description,
        },
        runtimeFor(userId).configurationFingerprint,
      )
    ) {
      throw new ScreenshotRecognitionServiceError(
        "AI_SUGGESTION_STALE",
        "Transaction changed. Request a new AI category suggestion",
        409,
      );
    }
    database
      .update(recognitionItems)
      .set({
        normalizedData: {
          ...parsed.data,
          categoryId: suggestion.categoryId,
          categorySuggestion: { ...suggestion, status: "adopted" },
        },
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(recognitionItems.id, itemId),
          eq(recognitionItems.jobId, jobId),
          eq(recognitionItems.userId, userId),
        ),
      )
      .run();
  }

  function invalidateStaleSuggestions(
    userId: string,
    jobId: string,
    configurationFingerprint: string,
  ) {
    const items = database
      .select()
      .from(recognitionItems)
      .where(
        and(
          eq(recognitionItems.userId, userId),
          eq(recognitionItems.jobId, jobId),
        ),
      )
      .orderBy(asc(recognitionItems.position))
      .all();
    const parsedItems = items.map((item) => ({
      item,
      parsed: stagedReceiptDataSchema.safeParse(item.normalizedData),
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

    const otherCategory = getDefaultCategory(database, userId, "other");
    if (!otherCategory) {
      throw new ScreenshotRecognitionServiceError(
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
      const normalizedData: StagedReceiptData = {
        ...parsed.data,
        categoryId: otherCategory.id,
      };
      delete normalizedData.categorySuggestion;
      database
        .update(recognitionItems)
        .set({ normalizedData, updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(recognitionItems.id, item.id),
            eq(recognitionItems.jobId, jobId),
            eq(recognitionItems.userId, userId),
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
