import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { categories, importItems } from "@/db/schema";
import { categoryKindSupportsTransaction } from "@/lib/category-kind";
import { decimalToMinor, minorToDecimal } from "@/lib/money";
import { normalizeTransactionTime } from "@/lib/transaction-time";
import { createCategorizationService } from "@/services/categorization-service";
import { createDeduplicationService } from "@/services/deduplication-service";
import { createAlipayBillEnrichmentMatcher } from "@/services/import-service/alipay-enrichment";
import type { ImportItemEditInput } from "@/services/import-service/cleaner";
import { ImportServiceError } from "@/services/import-service/error";
import { storedNormalizedSchema } from "@/services/import-service/schema";
import {
  getImportBatchRow,
  refreshImportBatchCounts,
} from "@/services/import-service/state";
import type { NormalizedImportTransaction } from "@/services/import-service/types";
import type {
  BillEnrichmentField,
  BillEnrichmentResolution,
} from "@/services/import-service/types";
import {
  duplicateAssessmentDigest,
  toDuplicateAssessment,
} from "@/services/ledger-transaction/review-decision";

export function createImportReviewCommands(database: Database) {
  const categorization = createCategorizationService(database);
  const deduplication = createDeduplicationService(database);
  const enrichmentMatcher = createAlipayBillEnrichmentMatcher(database);

  function updateItem(
    userId: string,
    batchId: string,
    itemId: string,
    input: ImportItemEditInput,
  ) {
    const batch = getImportBatchRow(database, userId, batchId);
    if (!batch) {
      throw new ImportServiceError("BATCH_NOT_FOUND", "Import batch not found", 404);
    }
    if (batch.status !== "reviewing") {
      throw new ImportServiceError("BATCH_NOT_EDITABLE", "Import batch is no longer editable", 409);
    }
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

    const current = storedNormalizedSchema.safeParse(item.normalizedData);
    if (!current.success) {
      throw new ImportServiceError("INVALID_STAGED_DATA", "Staged data is corrupted", 409);
    }
    let amountMinor: number;
    try {
      amountMinor = decimalToMinor(input.amount, input.currency);
      if (amountMinor <= 0) throw new Error("zero");
    } catch {
      throw new ImportServiceError("INVALID_AMOUNT", "Invalid amount format", 422);
    }

    let categoryId = input.categoryId;
    let categoryName: string | null = null;
    if (categoryId) {
      const category = database
        .select({ id: categories.id, name: categories.name, kind: categories.kind })
        .from(categories)
        .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
        .get();
      if (!category) {
        throw new ImportServiceError("CATEGORY_NOT_FOUND", "Selected category does not exist", 422);
      }
      if (!categoryKindSupportsTransaction(category.kind, input.type)) {
        throw new ImportServiceError(
          "CATEGORY_KIND_MISMATCH",
          "Selected category does not support this transaction type",
          422,
        );
      }
      categoryName = category.name;
    } else {
      const suggestion = categorization.suggest({
        userId,
        type: input.type,
        merchantName: input.merchantName,
        description: input.description,
      });
      categoryId = suggestion.categoryId;
      categoryName = suggestion.categoryName;
    }

    const transactionTime = normalizeTransactionTime(input.transactionTime);
    const data: NormalizedImportTransaction = {
      type: input.type,
      amount: minorToDecimal(amountMinor, input.currency),
      amountMinor,
      currency: input.currency,
      merchantName: input.merchantName,
      description: input.description,
      categoryId,
      categoryName,
      transactionTime,
      source: current.data.source,
      paymentMethod: input.paymentMethod,
      platformTransactionId: input.platformTransactionId,
      status: input.status,
    };
    const enrichmentData = enrichmentMatcher.match(userId, data);
    const duplicate = enrichmentData
      ? null
      : deduplication.check(userId, {
          type: input.type,
          amountMinor,
          currency: data.currency,
          merchantName: data.merchantName,
          description: data.description,
          transactionTime,
          source: data.source,
          platformTransactionId: data.platformTransactionId,
        });
    const duplicateStatus =
      enrichmentData?.status === "ambiguous"
        ? "possible_duplicate"
        : enrichmentData
          ? "unique"
          : duplicate!.status;
    const warnings =
      enrichmentData?.status === "ambiguous"
        ? [
            {
              code: "DUPLICATE_MATCH",
              message: "Multiple notification targets share the amount and time window; automatic enrichment is unavailable",
            },
          ]
        : duplicate?.reason
          ? [{ code: "DUPLICATE_MATCH", message: duplicate.reason }]
          : [];
    const decision =
      input.decision === "skip"
        ? "skip"
        : enrichmentData?.status === "conflict" ||
            enrichmentData?.status === "ambiguous"
          ? "pending"
          : enrichmentData?.status === "ready"
            ? "import"
        : duplicateStatus === "duplicate"
          ? "skip"
          : duplicateStatus === "possible_duplicate"
            ? input.decision === "import_anyway"
              ? "import_anyway"
              : "pending"
            : "import";

    database
      .update(importItems)
      .set({
        normalizedData: data as unknown as Record<string, unknown>,
        enrichmentData,
        validationErrors: [],
        warnings,
        duplicateStatus,
        duplicateTransactionId: duplicate?.transactionId ?? null,
        duplicateAssessmentDigest:
          duplicate?.status === "possible_duplicate"
            ? duplicateAssessmentDigest(toDuplicateAssessment(duplicate))
            : null,
        decision,
        resultCode: null,
        resultTransactionId: null,
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
    refreshImportBatchCounts(database, userId, batchId);
    return database
      .select()
      .from(importItems)
      .where(
        and(
          eq(importItems.id, itemId),
          eq(importItems.batchId, batchId),
          eq(importItems.userId, userId),
        ),
      )
      .get()!;
  }

  function setItemDecision(
    userId: string,
    batchId: string,
    itemId: string,
    decision: "skip" | "import" | "import_anyway",
  ) {
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
    const batch = getImportBatchRow(database, userId, batchId);
    if (!item || !batch) {
      throw new ImportServiceError("ITEM_NOT_FOUND", "Import record not found", 404);
    }
    if (batch.status !== "reviewing") {
      throw new ImportServiceError("BATCH_NOT_EDITABLE", "Import batch is no longer editable", 409);
    }
    if (
      item.enrichmentData?.status === "conflict" &&
      decision !== "skip"
    ) {
      throw new ImportServiceError(
        "UNRESOLVED_ENRICHMENT_CONFLICT",
        "Choose the current or statement value for each field first",
        409,
      );
    }
    if (item.validationErrors.length && decision !== "skip") {
      throw new ImportServiceError("ITEM_HAS_ERRORS", "Correct invalid fields first", 422);
    }
    const resolvedDecision =
      item.duplicateStatus === "duplicate"
        ? "skip"
        : item.duplicateStatus === "possible_duplicate" && decision === "import"
          ? "pending"
          : decision === "import_anyway" && item.duplicateStatus === "unique"
            ? "import"
            : decision;
    database
      .update(importItems)
      .set({ decision: resolvedDecision, updatedAt: new Date().toISOString() })
      .where(eq(importItems.id, itemId))
      .run();
    refreshImportBatchCounts(database, userId, batchId);
    return resolvedDecision;
  }

  function setEnrichmentResolution(
    userId: string,
    batchId: string,
    itemId: string,
    resolutions: Partial<
      Record<BillEnrichmentField, BillEnrichmentResolution>
    >,
  ) {
    const batch = getImportBatchRow(database, userId, batchId);
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
    if (!batch || !item) {
      throw new ImportServiceError("ITEM_NOT_FOUND", "Import record not found", 404);
    }
    if (batch.status !== "reviewing") {
      throw new ImportServiceError("BATCH_NOT_EDITABLE", "Import batch is no longer editable", 409);
    }
    const enrichment = item.enrichmentData;
    if (
      !enrichment ||
      enrichment.status === "ambiguous" ||
      !enrichment.targetKind
    ) {
      throw new ImportServiceError(
        "ITEM_NOT_ENRICHMENT_CONFLICT",
        "This record has no actionable enrichment conflict",
        409,
      );
    }
    const merged = { ...enrichment.resolutions, ...resolutions };
    const resolved = enrichment.conflicts.every((field) => Boolean(merged[field]));
    const updated = {
      ...enrichment,
      status: resolved ? ("ready" as const) : ("conflict" as const),
      resolutions: merged,
    };
    database
      .update(importItems)
      .set({
        enrichmentData: updated,
        decision: resolved ? "import" : "pending",
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
    refreshImportBatchCounts(database, userId, batchId);
    return database
      .select()
      .from(importItems)
      .where(eq(importItems.id, itemId))
      .get()!;
  }

  return { updateItem, setItemDecision, setEnrichmentResolution };
}
