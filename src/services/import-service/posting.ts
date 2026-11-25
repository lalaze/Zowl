import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  importBatches,
  importItems,
  transactions,
  transactionSupplementalEvidence,
} from "@/db/schema";
import type { AiCategorizationRuntimeResolver } from "@/services/ai-categorization-service";
import type { createImportAiCategorizationWorkflow } from "@/services/import-service/ai-categorization";
import { ImportServiceError } from "@/services/import-service/error";
import type { createImportReviewQueries } from "@/services/import-service/review-query";
import { confirmableNormalizedSchema } from "@/services/import-service/schema";
import {
  getImportBatchRow,
  refreshImportBatchCounts,
} from "@/services/import-service/state";
import type {
  BillEnrichmentData,
  BillEnrichmentField,
  BillEnrichmentValues,
} from "@/services/import-service/types";
import { createLedgerTransactionService } from "@/services/ledger-transaction";
import type { NeedsReviewItem } from "@/services/ledger-transaction/types";
import { createNotificationCaptureService } from "@/services/notification-capture-service";

type AiCategorizationWorkflow = ReturnType<
  typeof createImportAiCategorizationWorkflow
>;
type GetReview = ReturnType<typeof createImportReviewQueries>["getReview"];
type StagedItem = typeof importItems.$inferSelect;
type TargetEnrichment = Extract<
  BillEnrichmentData,
  { targetKind: "notification_capture" | "transaction" }
>;

class ImportNeedsReviewSignal extends Error {
  constructor(readonly items: NeedsReviewItem[]) {
    super("Import needs review");
  }
}

function isTargetEnrichment(
  value: BillEnrichmentData | null,
): value is TargetEnrichment {
  return (
    value?.status === "ready" ||
    value?.status === "conflict"
  );
}

function resolvedValues(enrichment: TargetEnrichment) {
  const fields = [
    "merchantName",
    "description",
    "paymentMethod",
    "categoryId",
  ] as const satisfies readonly BillEnrichmentField[];
  const resolved = { ...enrichment.current };
  const adoptedFields: BillEnrichmentField[] = [];
  for (const field of fields) {
    if (
      enrichment.resolutions[field] === "use_bill" &&
      enrichment.proposed[field] !== null
    ) {
      resolved[field] = enrichment.proposed[field];
      adoptedFields.push(field);
    }
  }
  return { resolved: resolved as BillEnrichmentValues, adoptedFields };
}

function recordNeedsReview(
  database: Database,
  userId: string,
  batchId: string,
  confirmationVersion: number,
  stagedItems: StagedItem[],
  reviews: NeedsReviewItem[],
) {
  const now = new Date().toISOString();
  const stagedItemsById = new Map(stagedItems.map((item) => [item.id, item]));
  database.transaction((tx) => {
    for (const review of reviews) {
      if (!review.assessment) continue;
      const stagedItem = stagedItemsById.get(review.sourceItemRef);
      const matchedItem = review.assessment.matchedCandidateRef
        ? stagedItemsById.get(review.assessment.matchedCandidateRef)
        : null;
      const duplicateMessage = matchedItem
        ? `May match batch row ${matchedItem.rowNumber} as the same transaction`
        : review.assessment.reasonCode === "same_amount_merchant_near_time"
          ? "Same amount and merchant; transaction times differ by at most 5 minutes"
          : review.assessment.reasonCode ===
                "cross_source_platform_transaction_id"
            ? "Same platform transaction ID from different import sources"
            : "Final review found possible duplicates";
      tx.update(importItems)
        .set({
          duplicateStatus: review.assessment.status,
          duplicateTransactionId: review.assessment.matchedTransactionId,
          duplicateAssessmentDigest: review.assessmentDigest,
          warnings: [
            ...(stagedItem?.warnings.filter(
              (warning) => warning.code !== "DUPLICATE_MATCH",
            ) ?? []),
            {
              code: "DUPLICATE_MATCH",
              message: duplicateMessage,
              ...(matchedItem
                ? {
                    matchedItemId: matchedItem.id,
                    matchedRowNumber: matchedItem.rowNumber,
                  }
                : {}),
            },
          ],
          decision: "pending",
          updatedAt: now,
        })
        .where(
          and(
            eq(importItems.id, review.sourceItemRef),
            eq(importItems.batchId, batchId),
            eq(importItems.userId, userId),
          ),
        )
        .run();
    }
    tx.update(importBatches)
      .set({
        confirmationVersion: confirmationVersion + 1,
        updatedAt: now,
      })
      .where(
        and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)),
      )
      .run();
  });
}

export function createImportPostingWorkflow(
  database: Database,
  runtimeFor: AiCategorizationRuntimeResolver,
  aiCategorization: AiCategorizationWorkflow,
  getReview: GetReview,
) {
  function confirm(userId: string, batchId: string) {
    const batch = getImportBatchRow(database, userId, batchId);
    if (!batch) {
      throw new ImportServiceError("BATCH_NOT_FOUND", "Import batch not found", 404);
    }
    if (batch.status === "completed") return getReview(userId, batchId);
    if (batch.status !== "reviewing") {
      throw new ImportServiceError("BATCH_NOT_CONFIRMABLE", "This batch cannot be confirmed", 409);
    }
    const configurationFingerprint =
      runtimeFor(userId).configurationFingerprint;
    const stagedItems = aiCategorization.invalidateStaleSuggestions(
      userId,
      batchId,
      configurationFingerprint,
    );
    const unresolvedInvalidItems = stagedItems.filter(
      (item) => item.validationErrors.length > 0 && item.decision !== "skip",
    );
    if (unresolvedInvalidItems.length) {
      const visibleIssues = unresolvedInvalidItems
        .slice(0, 3)
        .map(
          (item) =>
            `Row ${item.rowNumber}: ${item.validationErrors
              .map((issue) => issue.message)
              .join(", ")}`,
        )
        .join("; ");
      const remainingCount = unresolvedInvalidItems.length - 3;
      throw new ImportServiceError(
        "UNRESOLVED_INVALID_ITEMS",
        `${visibleIssues}${remainingCount > 0 ? `; Also ${remainingCount} rows` : ""}. Correct it manually or skip`,
        422,
      );
    }
    if (stagedItems.some((item) => item.decision === "pending")) {
      throw new ImportServiceError(
        "UNRESOLVED_DUPLICATES",
        "Some possible duplicates still need a decision",
        409,
      );
    }
    if (
      stagedItems.some(
        (item) =>
          item.enrichmentData?.status === "conflict" &&
          item.decision !== "skip",
      )
    ) {
      throw new ImportServiceError(
        "UNRESOLVED_ENRICHMENT_CONFLICT",
        "Bill enrichment conflicts still need individual decisions",
        409,
      );
    }

    const normalItems = stagedItems.filter(
      (item) => !isTargetEnrichment(item.enrichmentData),
    );
    const commandItems = normalItems
      .filter(
        (item) =>
          !(item.decision === "skip" && item.validationErrors.length > 0),
      )
      .map((item) => {
        const normalized = confirmableNormalizedSchema.safeParse(
          item.normalizedData,
        );
        if (!normalized.success) {
          throw new ImportServiceError(
            "ITEM_HAS_ERRORS",
            "Invalid records still need correction",
            422,
          );
        }
        const data = normalized.data;
        return {
          sourceItemRef: item.id,
          decision:
            item.decision === "skip" ? ("skip" as const) : ("post" as const),
          candidate: {
            facts: {
              type: data.type,
              amountMinor: data.amountMinor,
              currency: data.currency,
              merchantName: data.merchantName,
              description: data.description,
              categoryId: data.categoryId,
              transactionTime: data.transactionTime,
              paymentMethod: data.paymentMethod,
            },
            provenance: {
              kind: "file_import" as const,
              importItemId: item.id,
              batchId,
              fileId: batch.fileId,
              platform: data.source,
              platformTransactionId: data.platformTransactionId,
              platformStatus: data.status,
            },
          },
          duplicateOverride:
            item.decision === "import_anyway" &&
            item.duplicateAssessmentDigest
              ? { assessmentDigest: item.duplicateAssessmentDigest }
              : undefined,
        };
      });

    try {
      database.transaction((tx) => {
        const transactionalDatabase = tx as unknown as Database;
        const now = new Date().toISOString();
        const acquired = transactionalDatabase
          .update(importBatches)
          .set({ updatedAt: now })
          .where(
            and(
              eq(importBatches.id, batchId),
              eq(importBatches.userId, userId),
              eq(importBatches.status, "reviewing"),
              eq(importBatches.confirmationVersion, batch.confirmationVersion),
            ),
          )
          .returning({ id: importBatches.id })
          .all();
        if (!acquired.length) {
          throw new ImportServiceError(
            "BATCH_CHANGED",
            "Import batch changed. Review again",
            409,
          );
        }

        const ledger = createLedgerTransactionService(transactionalDatabase);
        const confirmation = ledger.confirmPosting(userId, {
          identity: {
            id: `file-import:${batchId}`,
            version: batch.confirmationVersion,
          },
          items: commandItems,
        });
        if (confirmation.status === "needs_review") {
          throw new ImportNeedsReviewSignal(confirmation.items);
        }
        transactionalDatabase
          .update(importBatches)
          .set({ status: "committing", updatedAt: now })
          .where(
            and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)),
          )
          .run();
        const outcomes = new Map(
          confirmation.items.map((item) => [item.sourceItemRef, item]),
        );
        const notificationService =
          createNotificationCaptureService(transactionalDatabase);

        for (const item of stagedItems) {
          if (item.decision === "skip" && item.validationErrors.length > 0) {
            transactionalDatabase
              .update(importItems)
              .set({
                resultTransactionId: null,
                resultCode: "SKIPPED_INVALID",
                updatedAt: now,
              })
              .where(eq(importItems.id, item.id))
              .run();
            continue;
          }

          const enrichment = item.enrichmentData;
          if (isTargetEnrichment(enrichment)) {
            if (item.decision === "skip") {
              transactionalDatabase
                .update(importItems)
                .set({
                  resultTransactionId: null,
                  resultCode: "SKIPPED_BY_USER",
                  updatedAt: now,
                })
                .where(eq(importItems.id, item.id))
                .run();
              continue;
            }
            const normalized = confirmableNormalizedSchema.parse(
              item.normalizedData,
            );
            const { resolved, adoptedFields } = resolvedValues(enrichment);
            let transactionId: string;
            let resultCode:
              | "ENRICHED_CAPTURE_POSTED"
              | "ENRICHED_TRANSACTION";

            if (enrichment.targetKind === "notification_capture") {
              const expectedVersion = Number.parseInt(
                enrichment.targetVersion,
                10,
              );
              const confirmed = notificationService.confirmBillEnrichment(
                userId,
                enrichment.captureId,
                {
                  expectedConfirmationVersion: expectedVersion,
                  values: resolved,
                  adoptedFields,
                },
              );
              if (
                confirmed.status !== "completed" ||
                confirmed.outcome.outcome !== "posted" ||
                !confirmed.outcome.transactionId
              ) {
                throw new ImportServiceError(
                  "ENRICHMENT_NEEDS_REVIEW",
                  "Notification candidate duplicate status changed. Review again",
                  409,
                );
              }
              transactionId = confirmed.outcome.transactionId;
              resultCode = "ENRICHED_CAPTURE_POSTED";
            } else {
              const current = transactionalDatabase
                .select()
                .from(transactions)
                .where(
                  and(
                    eq(transactions.id, enrichment.targetId),
                    eq(transactions.userId, userId),
                  ),
                )
                .get();
              if (
                !current ||
                current.voidedAt ||
                current.currentRevisionId !== enrichment.targetVersion ||
                current.amountMinor !== enrichment.immutable.amountMinor ||
                current.currency !== enrichment.immutable.currency ||
                current.transactionTime !== enrichment.immutable.transactionTime
              ) {
                throw new ImportServiceError(
                  "ENRICHMENT_TARGET_CHANGED",
                  "Transaction to enrich changed. Review again",
                  409,
                );
              }
              const amendment = ledger.amendTransaction(userId, {
                transactionId: current.id,
                expectedRevisionId: current.currentRevisionId,
                operationId: `file-import-enrichment:${item.id}`,
                facts: {
                  type: current.type,
                  amountMinor: current.amountMinor,
                  currency: current.currency,
                  merchantName: resolved.merchantName,
                  description: resolved.description,
                  categoryId: resolved.categoryId,
                  transactionTime: current.transactionTime,
                  paymentMethod: resolved.paymentMethod,
                },
                learnCategoryRule: false,
              });
              if (amendment.status !== "completed") {
                throw new ImportServiceError(
                  "ENRICHMENT_TARGET_CHANGED",
                  "Revision or duplicate status of the transaction to enrich changed. Review again",
                  409,
                );
              }
              transactionId = current.id;
              resultCode = "ENRICHED_TRANSACTION";
            }

            transactionalDatabase
              .insert(transactionSupplementalEvidence)
              .values({
                id: randomUUID(),
                userId,
                transactionId,
                importItemId: item.id,
                fileId: batch.fileId,
                source: normalized.source,
                platformTransactionId: normalized.platformTransactionId,
                platformStatus: normalized.status,
                createdAt: now,
              })
              .run();
            transactionalDatabase
              .update(importItems)
              .set({
                resultTransactionId: transactionId,
                resultCode,
                duplicateStatus: "unique",
                duplicateTransactionId: null,
                updatedAt: now,
              })
              .where(eq(importItems.id, item.id))
              .run();
            continue;
          }

          const outcome = outcomes.get(item.id);
          if (!outcome) {
            throw new ImportServiceError(
              "CONFIRMATION_RESULT_MISSING",
              "Confirmation result is missing an import item",
              500,
            );
          }
          const resultCode =
            outcome.outcome === "posted"
              ? "IMPORTED"
              : outcome.outcome === "duplicate"
                ? "SKIPPED_DUPLICATE"
                : item.duplicateStatus === "possible_duplicate"
                  ? "SKIPPED_POSSIBLE_DUPLICATE"
                  : item.validationErrors.length
                    ? "SKIPPED_INVALID"
                    : "SKIPPED_BY_USER";
          transactionalDatabase
            .update(importItems)
            .set({
              resultTransactionId:
                outcome.outcome === "posted" ? outcome.transactionId : null,
              resultCode,
              duplicateStatus:
                outcome.outcome === "duplicate"
                  ? "duplicate"
                  : item.duplicateStatus,
              duplicateTransactionId:
                outcome.outcome === "duplicate"
                  ? outcome.transactionId
                  : item.duplicateTransactionId,
              decision:
                outcome.outcome === "duplicate" ? "skip" : item.decision,
              updatedAt: now,
            })
            .where(eq(importItems.id, item.id))
            .run();
        }

        const counts = refreshImportBatchCounts(
          transactionalDatabase,
          userId,
          batchId,
        );
        transactionalDatabase
          .update(importBatches)
          .set({
            ...counts,
            status: "completed",
            completedAt: now,
            updatedAt: now,
          })
          .where(
            and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)),
          )
          .run();
      });
    } catch (error) {
      if (error instanceof ImportNeedsReviewSignal) {
        recordNeedsReview(
          database,
          userId,
          batchId,
          batch.confirmationVersion,
          stagedItems,
          error.items,
        );
        throw new ImportServiceError(
          "UNRESOLVED_DUPLICATES",
          "Final review found new possible duplicates. Choose an action again",
          409,
        );
      }
      throw error;
    }

    return getReview(userId, batchId);
  }

  return { confirm };
}
