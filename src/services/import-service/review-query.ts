import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { importBatches, importItems, storedFiles } from "@/db/schema";
import { getDefaultCategory } from "@/services/categorization-service/default-category";
import {
  isAiCategorySuggestionStale,
  type AiCategorizationRuntimeResolver,
} from "@/services/ai-categorization-service";
import { ImportServiceError } from "@/services/import-service/error";
import type { NormalizedImportTransaction } from "@/services/import-service/types";

export type ImportReviewFilter = "all" | "pending" | "errors";

export type ImportReviewOptions = {
  page?: number;
  pageSize?: number;
  filter?: ImportReviewFilter;
};

function asCount(value: unknown) {
  return Number(value ?? 0);
}

export function createImportReviewQueries(
  database: Database,
  runtimeFor: AiCategorizationRuntimeResolver,
) {
  function getReview(
    userId: string,
    batchId: string,
    options: ImportReviewOptions = {},
  ) {
    const batch = database
      .select({
        batch: importBatches,
        fileName: storedFiles.originalName,
        fileSize: storedFiles.size,
      })
      .from(importBatches)
      .innerJoin(storedFiles, eq(importBatches.fileId, storedFiles.id))
      .where(
        and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)),
      )
      .get();
    if (!batch) {
      throw new ImportServiceError("BATCH_NOT_FOUND", "Import batch not found", 404);
    }

    const pageSize = Math.min(Math.max(options.pageSize ?? 50, 1), 100);
    const filter = options.filter ?? "all";
    const batchItemsWhere = and(
      eq(importItems.userId, userId),
      eq(importItems.batchId, batchId),
    );
    const itemWhere =
      filter === "pending"
        ? and(
            batchItemsWhere,
            eq(importItems.decision, "pending"),
            sql`json_array_length(${importItems.validationErrors}) = 0`,
          )
        : filter === "errors"
          ? and(
              batchItemsWhere,
              sql`json_array_length(${importItems.validationErrors}) > 0`,
            )
          : batchItemsWhere;
    const filteredCount = asCount(
      database
        .select({ count: sql<number>`count(*)` })
        .from(importItems)
        .where(itemWhere)
        .get()?.count,
    );
    const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
    const page = Math.min(Math.max(options.page ?? 1, 1), totalPages);
    const rawItems = database
      .select()
      .from(importItems)
      .where(itemWhere)
      .orderBy(asc(importItems.rowNumber))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();
    const configurationFingerprint = runtimeFor(userId).configurationFingerprint;
    const hasStaleSuggestion =
      batch.batch.status === "reviewing" &&
      rawItems.some((item) => {
        const normalizedData =
          item.normalizedData as NormalizedImportTransaction | null;
        return isAiCategorySuggestionStale(
          normalizedData?.categorySuggestion,
          configurationFingerprint,
        );
      });
    const otherCategory = hasStaleSuggestion
      ? getDefaultCategory(database, userId, "other")
      : null;
    const items = rawItems.map((item) => {
      const normalizedData =
        item.normalizedData as NormalizedImportTransaction | null;
      const staleSuggestion =
        batch.batch.status === "reviewing" &&
        isAiCategorySuggestionStale(
          normalizedData?.categorySuggestion,
          configurationFingerprint,
        );
      return {
        ...item,
        normalizedData:
          normalizedData && staleSuggestion
            ? {
                ...normalizedData,
                categoryId: otherCategory?.id ?? normalizedData.categoryId,
                categoryName: otherCategory?.name ?? normalizedData.categoryName,
                categorySuggestion: undefined,
              }
            : normalizedData,
      };
    });
    const counts = database
      .select({
        pending: sql<number>`sum(case when ${importItems.decision} = 'pending' then 1 else 0 end)`,
        import: sql<number>`sum(case when ${importItems.decision} = 'import' then 1 else 0 end)`,
        skip: sql<number>`sum(case when ${importItems.decision} = 'skip' then 1 else 0 end)`,
        importAnyway: sql<number>`sum(case when ${importItems.decision} = 'import_anyway' then 1 else 0 end)`,
        invalid: sql<number>`sum(case when json_array_length(${importItems.validationErrors}) > 0 then 1 else 0 end)`,
        unresolvedInvalid: sql<number>`sum(case when json_array_length(${importItems.validationErrors}) > 0 and ${importItems.decision} = 'pending' then 1 else 0 end)`,
        unresolvedDuplicate: sql<number>`sum(case when json_array_length(${importItems.validationErrors}) = 0 and ${importItems.duplicateStatus} = 'possible_duplicate' and ${importItems.decision} = 'pending' then 1 else 0 end)`,
        unresolvedEnrichment: sql<number>`sum(case when json_extract(${importItems.enrichmentData}, '$.status') = 'conflict' and ${importItems.decision} = 'pending' then 1 else 0 end)`,
      })
      .from(importItems)
      .where(batchItemsWhere)
      .get();

    return {
      ...batch,
      items,
      decisionCounts: {
        pending: asCount(counts?.pending),
        import: asCount(counts?.import),
        skip: asCount(counts?.skip),
        importAnyway: asCount(counts?.importAnyway),
      },
      issueCounts: {
        invalid: asCount(counts?.invalid),
        unresolvedInvalid: asCount(counts?.unresolvedInvalid),
        unresolvedDuplicate: asCount(counts?.unresolvedDuplicate),
        unresolvedEnrichment: asCount(counts?.unresolvedEnrichment),
      },
      pagination: {
        page,
        pageSize,
        totalPages,
        totalCount: filteredCount,
        filter,
      },
    };
  }

  function listBatches(userId: string, limit = 10) {
    return database
      .select({
        id: importBatches.id,
        source: importBatches.source,
        status: importBatches.status,
        fileName: storedFiles.originalName,
        totalCount: importBatches.totalCount,
        importedCount: importBatches.importedCount,
        failedCount: importBatches.failedCount,
        createdAt: importBatches.createdAt,
      })
      .from(importBatches)
      .innerJoin(storedFiles, eq(importBatches.fileId, storedFiles.id))
      .where(eq(importBatches.userId, userId))
      .orderBy(desc(importBatches.createdAt))
      .limit(Math.min(Math.max(limit, 1), 50))
      .all();
  }

  function getNextUnresolvedError(userId: string, batchId: string) {
    const item = database
      .select()
      .from(importItems)
      .where(
        and(
          eq(importItems.userId, userId),
          eq(importItems.batchId, batchId),
          eq(importItems.decision, "pending"),
          sql`json_array_length(${importItems.validationErrors}) > 0`,
        ),
      )
      .orderBy(asc(importItems.rowNumber))
      .get();
    return item
      ? {
          ...item,
          normalizedData:
            item.normalizedData as NormalizedImportTransaction | null,
        }
      : null;
  }

  function getNextUnresolvedDuplicate(userId: string, batchId: string) {
    const item = database
      .select()
      .from(importItems)
      .where(
        and(
          eq(importItems.userId, userId),
          eq(importItems.batchId, batchId),
          eq(importItems.decision, "pending"),
          eq(importItems.duplicateStatus, "possible_duplicate"),
          sql`json_array_length(${importItems.validationErrors}) = 0`,
        ),
      )
      .orderBy(asc(importItems.rowNumber))
      .get();
    if (!item) return null;

    const duplicateWarning = item.warnings.find(
      (warning) => warning.code === "DUPLICATE_MATCH",
    );
    const legacyMatchedRow = duplicateWarning?.message.match(
      /(?:与本批次第|May match batch row)\s*(\d+)(?:\s*行|\b)/u,
    )?.[1];
    const matchedRowNumber =
      duplicateWarning?.matchedRowNumber ??
      (legacyMatchedRow ? Number.parseInt(legacyMatchedRow, 10) : null);
    const matchedItem = duplicateWarning?.matchedItemId
      ? database
          .select()
          .from(importItems)
          .where(
            and(
              eq(importItems.id, duplicateWarning.matchedItemId),
              eq(importItems.userId, userId),
              eq(importItems.batchId, batchId),
            ),
          )
          .get()
      : matchedRowNumber
        ? database
            .select()
            .from(importItems)
            .where(
              and(
                eq(importItems.userId, userId),
                eq(importItems.batchId, batchId),
                eq(importItems.rowNumber, matchedRowNumber),
              ),
            )
            .get()
        : null;

    return {
      item: {
        ...item,
        normalizedData:
          item.normalizedData as NormalizedImportTransaction | null,
      },
      matchedItem: matchedItem
        ? {
            ...matchedItem,
            normalizedData:
              matchedItem.normalizedData as NormalizedImportTransaction | null,
          }
        : null,
    };
  }

  return {
    getReview,
    listBatches,
    getNextUnresolvedError,
    getNextUnresolvedDuplicate,
  };
}
