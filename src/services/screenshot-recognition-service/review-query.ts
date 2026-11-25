import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/db/client";
import { recognitionItems, recognitionJobs, storedFiles } from "@/db/schema";
import { getDefaultCategory } from "@/services/categorization-service/default-category";
import {
  isAiCategorySuggestionStale,
  type AiCategorizationRuntimeResolver,
} from "@/services/ai-categorization-service";
import { minorToDecimal } from "@/lib/money";
import { safeStoredData } from "@/services/screenshot-recognition-service/data";
import { ScreenshotRecognitionServiceError } from "@/services/screenshot-recognition-service/error";
import { getRecognitionJobRow } from "@/services/screenshot-recognition-service/state";

type ReviewRow = {
  item: typeof recognitionItems.$inferSelect;
  file: typeof storedFiles.$inferSelect;
};

function projectItem(
  row: ReviewRow,
  editable: boolean,
  configurationFingerprint: string | null,
  fallbackCategoryId: string | null,
) {
  const data = safeStoredData(row.item.normalizedData);
  const staleSuggestion =
    editable &&
    configurationFingerprint !== null &&
    isAiCategorySuggestionStale(
      data.categorySuggestion,
      configurationFingerprint,
    );
  return {
    id: row.item.id,
    fileId: row.file.id,
    fileName: row.file.originalName,
    previewUrl: row.file.deletedAt ? "" : `/api/files/${row.file.id}`,
    fileDeleted: Boolean(row.file.deletedAt),
    status: row.item.status,
    errorMessage:
      row.item.status === "recognition_failed" ? "Recognition service temporarily unavailable" : null,
    transactionTime: data.transactionTime,
    type: data.type,
    amountMinor: data.amountMinor,
    amount:
      data.amountMinor === null || data.currency === null
        ? null
        : minorToDecimal(data.amountMinor, data.currency),
    currency: data.currency,
    merchantName: data.merchantName,
    categoryId: staleSuggestion
      ? fallbackCategoryId ?? data.categoryId
      : data.categoryId,
    suggestedCategory: data.suggestedCategory,
    description: data.description,
    paymentMethod: data.paymentMethod,
    platformTransactionId: data.platformTransactionId,
    transactionStatus: data.transactionStatus,
    confidence: data.confidence,
    categorySuggestion: staleSuggestion ? undefined : data.categorySuggestion,
    warnings: row.item.warnings,
    validationErrors: row.item.validationErrors,
    duplicateKind: row.item.duplicateStatus,
    duplicateTransactionId: row.item.duplicateTransactionId,
    decision: row.item.decision,
    resultCode: row.item.resultCode,
    resultTransactionId: row.item.resultTransactionId,
  };
}

export function createScreenshotReviewQueries(
  database: Database,
  runtimeFor: AiCategorizationRuntimeResolver,
) {
  function itemRows(userId: string, jobId: string, itemId?: string) {
    const ownership = and(
      eq(recognitionItems.jobId, jobId),
      eq(recognitionItems.userId, userId),
      eq(storedFiles.userId, userId),
    );
    return database
      .select({ item: recognitionItems, file: storedFiles })
      .from(recognitionItems)
      .innerJoin(storedFiles, eq(recognitionItems.fileId, storedFiles.id))
      .where(
        itemId ? and(ownership, eq(recognitionItems.id, itemId)) : ownership,
      )
      .orderBy(asc(recognitionItems.position));
  }

  function projectionContext(
    userId: string,
    editable: boolean,
    rows: ReviewRow[],
  ) {
    const configurationFingerprint = editable
      ? runtimeFor(userId).configurationFingerprint
      : null;
    const hasStaleSuggestion =
      configurationFingerprint !== null &&
      rows.some((row) =>
        isAiCategorySuggestionStale(
          safeStoredData(row.item.normalizedData).categorySuggestion,
          configurationFingerprint,
        ),
      );
    const fallbackCategoryId = hasStaleSuggestion
      ? getDefaultCategory(database, userId, "other")?.id ?? null
      : null;
    return { configurationFingerprint, fallbackCategoryId };
  }

  function getItem(userId: string, jobId: string, itemId: string) {
    const job = getRecognitionJobRow(database, userId, jobId);
    const row = itemRows(userId, jobId, itemId).get();
    if (!row) {
      throw new ScreenshotRecognitionServiceError(
        "RECOGNITION_ITEM_NOT_FOUND",
        "Recognition item not found",
        404,
      );
    }
    const editable = job?.status === "reviewing";
    const context = projectionContext(userId, editable, [row]);
    return projectItem(
      row,
      editable,
      context.configurationFingerprint,
      context.fallbackCategoryId,
    );
  }

  function getReview(userId: string, jobId: string) {
    const job = getRecognitionJobRow(database, userId, jobId);
    if (!job) {
      throw new ScreenshotRecognitionServiceError(
        "RECOGNITION_JOB_NOT_FOUND",
        "Recognition task not found",
        404,
      );
    }
    const rows = itemRows(userId, jobId).all();
    const editable = job.status === "reviewing";
    const context = projectionContext(userId, editable, rows);
    return {
      job: {
        id: job.id,
        status: job.status,
        providerId: job.providerId,
        totalCount: job.totalCount,
        succeededCount: job.succeededCount,
        failedCount: job.failedCount,
        importedCount: job.importedCount,
        skippedCount: job.skippedCount,
        failureCode: job.failureCode,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
      },
      items: rows.map((row) =>
        projectItem(
          row,
          editable,
          context.configurationFingerprint,
          context.fallbackCategoryId,
        ),
      ),
    };
  }

  function listJobs(userId: string, limit = 20) {
    return database
      .select()
      .from(recognitionJobs)
      .where(eq(recognitionJobs.userId, userId))
      .orderBy(desc(recognitionJobs.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100))
      .all();
  }

  function pendingJobs(userId: string) {
    return database.select().from(recognitionJobs).where(and(eq(recognitionJobs.userId, userId), inArray(recognitionJobs.status, ["reviewing", "processing"]))).orderBy(desc(recognitionJobs.createdAt), desc(recognitionJobs.id)).all();
  }
  return { getItem, getReview, listJobs, pendingJobs };
}
