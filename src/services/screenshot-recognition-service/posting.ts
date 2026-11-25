import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { recognitionItems, recognitionJobs } from "@/db/schema";
import type { AiCategorizationRuntimeResolver } from "@/services/ai-categorization-service";
import { createLedgerTransactionService } from "@/services/ledger-transaction";
import type { createScreenshotAiCategorizationWorkflow } from "@/services/screenshot-recognition-service/ai-categorization";
import { ScreenshotRecognitionServiceError } from "@/services/screenshot-recognition-service/error";
import { confirmableReceiptDataSchema } from "@/services/screenshot-recognition-service/schema";
import { getRecognitionJobRow } from "@/services/screenshot-recognition-service/state";

type AiCategorizationWorkflow = ReturnType<
  typeof createScreenshotAiCategorizationWorkflow
>;

export function createScreenshotPostingWorkflow(
  database: Database,
  runtimeFor: AiCategorizationRuntimeResolver,
  aiCategorization: AiCategorizationWorkflow,
) {
  const ledger = createLedgerTransactionService(database);

  function confirm(userId: string, jobId: string) {
    const current = getRecognitionJobRow(database, userId, jobId);
    if (!current) {
      throw new ScreenshotRecognitionServiceError(
        "RECOGNITION_JOB_NOT_FOUND",
        "Recognition task not found",
        404,
      );
    }
    if (current.status === "completed") {
      return {
        jobId,
        createdCount: current.importedCount,
        skippedCount: current.skippedCount,
        failedCount: current.failedCount,
      };
    }
    if (current.status !== "reviewing") {
      throw new ScreenshotRecognitionServiceError(
        "RECOGNITION_JOB_NOT_CONFIRMABLE",
        "This recognition task cannot be confirmed",
        409,
      );
    }
    const configurationFingerprint =
      runtimeFor(userId).configurationFingerprint;
    const items = aiCategorization.invalidateStaleSuggestions(
      userId,
      jobId,
      configurationFingerprint,
    );
    if (items.some((item) => item.decision === "pending")) {
      throw new ScreenshotRecognitionServiceError(
        "RECOGNITION_ITEMS_PENDING",
        "Some screenshots still need fields completed or duplicate decisions",
        409,
      );
    }

    const commandItems = items.flatMap((item) => {
      const parsed = confirmableReceiptDataSchema.safeParse(item.normalizedData);
      if (!parsed.success || item.validationErrors.length) {
        if (item.decision === "skip") return [];
        throw new ScreenshotRecognitionServiceError(
          "RECOGNITION_ITEM_INVALID",
          "Recognition item is stale. Save it again before confirming",
          409,
        );
      }
      const data = parsed.data;
      return [
        {
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
              kind: "screenshot_recognition" as const,
              recognitionItemId: item.id,
              jobId,
              fileId: item.fileId,
              providerId: current.providerId,
              platformTransactionId: data.platformTransactionId,
              platformStatus: data.transactionStatus,
              confidenceBasisPoints:
                data.confidence === null
                  ? null
                  : Math.round(data.confidence * 10_000),
            },
          },
          duplicateOverride:
            item.decision === "import_anyway" && item.duplicateAssessmentDigest
              ? { assessmentDigest: item.duplicateAssessmentDigest }
              : undefined,
        },
      ];
    });

    const confirmation = ledger.confirmPosting(userId, {
      identity: {
        id: `screenshot-recognition:${jobId}`,
        version: current.confirmationVersion,
      },
      items: commandItems,
    });
    if (confirmation.status === "needs_review") {
      const now = new Date().toISOString();
      database.transaction((tx) => {
        for (const review of confirmation.items) {
          if (!review.assessment) continue;
          tx.update(recognitionItems)
            .set({
              duplicateStatus: review.assessment.status,
              duplicateTransactionId:
                review.assessment.matchedTransactionId,
              duplicateAssessmentDigest: review.assessmentDigest,
              decision: "pending",
              resultCode: null,
              updatedAt: now,
            })
            .where(
              and(
                eq(recognitionItems.id, review.sourceItemRef),
                eq(recognitionItems.jobId, jobId),
                eq(recognitionItems.userId, userId),
              ),
            )
            .run();
        }
        tx.update(recognitionJobs)
          .set({
            confirmationVersion: current.confirmationVersion + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(recognitionJobs.id, jobId),
              eq(recognitionJobs.userId, userId),
            ),
          )
          .run();
      });
      throw new ScreenshotRecognitionServiceError(
        "DUPLICATE_REVIEW_REQUIRED",
        "New possible duplicates found before confirmation. Choose how to handle them again",
        409,
      );
    }

    const outcomes = new Map(
      confirmation.items.map((item) => [item.sourceItemRef, item]),
    );
    database.transaction((tx) => {
      const transactionalDatabase = tx as unknown as Database;
      const now = new Date().toISOString();
      transactionalDatabase
        .update(recognitionJobs)
        .set({ status: "committing", updatedAt: now })
        .where(
          and(
            eq(recognitionJobs.id, jobId),
            eq(recognitionJobs.userId, userId),
          ),
        )
        .run();

      let importedCount = 0;
      for (const item of items) {
        const outcome = outcomes.get(item.id);
        if (!outcome) {
          transactionalDatabase
            .update(recognitionItems)
            .set({ resultCode: "SKIPPED_INVALID", updatedAt: now })
            .where(eq(recognitionItems.id, item.id))
            .run();
          continue;
        }
        if (outcome.outcome === "posted") importedCount += 1;
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
          .update(recognitionItems)
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
          .where(eq(recognitionItems.id, item.id))
          .run();
      }
      transactionalDatabase
        .update(recognitionJobs)
        .set({
          status: "completed",
          importedCount,
          skippedCount: items.length - importedCount,
          completedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(recognitionJobs.id, jobId),
            eq(recognitionJobs.userId, userId),
          ),
        )
        .run();
    });

    const completed = getRecognitionJobRow(database, userId, jobId)!;
    return {
      jobId,
      createdCount: completed.importedCount,
      skippedCount: completed.skippedCount,
      failedCount: completed.failedCount,
    };
  }

  return { confirm };
}
