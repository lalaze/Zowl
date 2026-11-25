import { and, eq, isNotNull, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { importBatches, importItems } from "@/db/schema";

export function getImportBatchRow(
  database: Database,
  userId: string,
  batchId: string,
) {
  return database
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)))
    .get();
}

export function refreshImportBatchCounts(
  database: Database,
  userId: string,
  batchId: string,
) {
  const batchItemsWhere = and(
    eq(importItems.userId, userId),
    eq(importItems.batchId, batchId),
  );
  const hasResults = Boolean(
    database
      .select({ id: importItems.id })
      .from(importItems)
      .where(and(batchItemsWhere, isNotNull(importItems.resultCode)))
      .limit(1)
      .get(),
  );
  const aggregate = database
    .select({
      totalCount: sql<number>`count(*)`,
      validCount: sql<number>`sum(case when json_array_length(${importItems.validationErrors}) = 0 then 1 else 0 end)`,
      importedCount: sql<number>`sum(case when ${importItems.resultTransactionId} is not null then 1 else 0 end)`,
      createdCount: hasResults
        ? sql<number>`sum(case when ${importItems.resultCode} = 'IMPORTED' then 1 else 0 end)`
        : sql<number>`0`,
      enrichedCount: hasResults
        ? sql<number>`sum(case when ${importItems.resultCode} in ('ENRICHED_CAPTURE_POSTED', 'ENRICHED_TRANSACTION') then 1 else 0 end)`
        : sql<number>`0`,
      duplicateCount: hasResults
        ? sql<number>`sum(case when ${importItems.resultCode} in ('SKIPPED_DUPLICATE', 'SKIPPED_POSSIBLE_DUPLICATE') then 1 else 0 end)`
        : sql<number>`sum(case when ${importItems.duplicateStatus} <> 'unique' then 1 else 0 end)`,
      skippedCount: hasResults
        ? sql<number>`sum(case when ${importItems.resultCode} = 'SKIPPED_BY_USER' then 1 else 0 end)`
        : sql<number>`sum(case when ${importItems.decision} = 'skip' then 1 else 0 end)`,
      failedCount: hasResults
        ? sql<number>`sum(case when ${importItems.resultCode} in ('SKIPPED_INVALID', 'WRITE_FAILED') then 1 else 0 end)`
        : sql<number>`sum(case when json_array_length(${importItems.validationErrors}) > 0 then 1 else 0 end)`,
    })
    .from(importItems)
    .where(batchItemsWhere)
    .get();

  const counts = {
    totalCount: Number(aggregate?.totalCount ?? 0),
    validCount: Number(aggregate?.validCount ?? 0),
    importedCount: Number(aggregate?.importedCount ?? 0),
    createdCount: Number(aggregate?.createdCount ?? 0),
    enrichedCount: Number(aggregate?.enrichedCount ?? 0),
    duplicateCount: Number(aggregate?.duplicateCount ?? 0),
    skippedCount: Number(aggregate?.skippedCount ?? 0),
    failedCount: Number(aggregate?.failedCount ?? 0),
  };

  database
    .update(importBatches)
    .set({ ...counts, updatedAt: new Date().toISOString() })
    .where(and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)))
    .run();

  return counts;
}
