import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { recognitionItems, recognitionJobs } from "@/db/schema";
import { createDeduplicationService } from "@/services/deduplication-service";
import {
  duplicateAssessmentDigest,
  toDuplicateAssessment,
} from "@/services/ledger-transaction/review-decision";
import {
  assertOwnedCategory,
  compareStagedTransactions,
  deduplicationInput,
  resolveSuggestedCategory,
  safeStoredData,
  withoutCategorySuggestion,
} from "@/services/screenshot-recognition-service/data";
import { ScreenshotRecognitionServiceError } from "@/services/screenshot-recognition-service/error";
import type { createScreenshotReviewQueries } from "@/services/screenshot-recognition-service/review-query";
import {
  confirmableReceiptDataSchema,
  receiptDecisionSchema,
  receiptItemEditSchema,
  type ConfirmableReceiptData,
  type ReceiptDecision,
  type ReceiptItemEdit,
} from "@/services/screenshot-recognition-service/schema";
import { getRecognitionJobRow } from "@/services/screenshot-recognition-service/state";

type GetItem = ReturnType<typeof createScreenshotReviewQueries>["getItem"];

export function createScreenshotReviewCommands(
  database: Database,
  getItem: GetItem,
) {
  function findBatchDuplicate(
    databaseForQuery: Database,
    userId: string,
    jobId: string,
    currentItemId: string,
    data: ConfirmableReceiptData,
  ) {
    const others = databaseForQuery
      .select({
        id: recognitionItems.id,
        normalizedData: recognitionItems.normalizedData,
        decision: recognitionItems.decision,
      })
      .from(recognitionItems)
      .where(
        and(
          eq(recognitionItems.userId, userId),
          eq(recognitionItems.jobId, jobId),
        ),
      )
      .all();
    let possibleDuplicate = false;
    for (const other of others) {
      if (other.id === currentItemId || other.decision === "skip") continue;
      const parsed = confirmableReceiptDataSchema.safeParse(other.normalizedData);
      if (!parsed.success) continue;
      const status = compareStagedTransactions(data, parsed.data);
      if (status === "duplicate") return status;
      if (status === "possible_duplicate") possibleDuplicate = true;
    }
    return possibleDuplicate ? ("possible_duplicate" as const) : null;
  }

  function updateItem(
    userId: string,
    jobId: string,
    itemId: string,
    rawInput: ReceiptItemEdit,
  ) {
    const input = receiptItemEditSchema.parse(rawInput);
    const job = getRecognitionJobRow(database, userId, jobId);
    if (!job) {
      throw new ScreenshotRecognitionServiceError(
        "RECOGNITION_JOB_NOT_FOUND",
        "Recognition task not found",
        404,
      );
    }
    database.transaction((tx) => {
      const transactionalDatabase = tx as unknown as Database;
      const acquired = transactionalDatabase
        .update(recognitionJobs)
        .set({ updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(recognitionJobs.id, jobId),
            eq(recognitionJobs.userId, userId),
            eq(recognitionJobs.status, "reviewing"),
          ),
        )
        .returning({ id: recognitionJobs.id })
        .all();
      if (!acquired.length) {
        throw new ScreenshotRecognitionServiceError(
          "RECOGNITION_JOB_NOT_EDITABLE",
          "This recognition task cannot be edited",
          409,
        );
      }
      const item = transactionalDatabase
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
      assertOwnedCategory(
        transactionalDatabase,
        userId,
        input.categoryId,
        input.type,
      );
      const current = safeStoredData(item.normalizedData);
      const currentFacts = withoutCategorySuggestion(current);
      const data = confirmableReceiptDataSchema.parse({
        ...currentFacts,
        ...input,
        source: "screenshot",
      });
      data.categoryId =
        input.categoryId ??
        resolveSuggestedCategory(transactionalDatabase, userId, data);
      const duplicate = createDeduplicationService(transactionalDatabase).check(
        userId,
        deduplicationInput(data),
      );
      const inBatchDuplicate =
        duplicate.status === "unique" &&
        findBatchDuplicate(
          transactionalDatabase,
          userId,
          jobId,
          itemId,
          data,
        );
      const duplicateStatus = inBatchDuplicate || duplicate.status;
      const duplicateMessage = inBatchDuplicate
        ? inBatchDuplicate === "duplicate"
          ? "Identical transaction to another screenshot in this batch"
          : "Similar amount, merchant, and time to another screenshot in this batch"
        : duplicate.reason;
      const preservedWarnings = item.warnings.filter(
        (warning) => !/duplicate|identical|重复|完全相同/iu.test(warning),
      );
      const decision =
        duplicateStatus === "duplicate"
          ? "skip"
          : duplicateStatus === "possible_duplicate"
            ? item.decision === "skip" || item.decision === "import_anyway"
              ? item.decision
              : "pending"
            : item.decision === "skip"
              ? "skip"
              : "import";
      transactionalDatabase
        .update(recognitionItems)
        .set({
          status: "recognized",
          normalizedData: data,
          validationErrors: [],
          warnings: duplicateMessage
            ? [...preservedWarnings, duplicateMessage]
            : preservedWarnings,
          duplicateStatus,
          duplicateTransactionId: duplicate.transactionId,
          duplicateAssessmentDigest:
            !inBatchDuplicate && duplicate.status === "possible_duplicate"
              ? duplicateAssessmentDigest(toDuplicateAssessment(duplicate))
              : null,
          decision,
          resultCode: null,
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
    });
    return getItem(userId, jobId, itemId);
  }

  function setDecision(
    userId: string,
    jobId: string,
    itemId: string,
    rawDecision: ReceiptDecision,
  ) {
    const decision = receiptDecisionSchema.parse(rawDecision);
    const job = getRecognitionJobRow(database, userId, jobId);
    if (!job) {
      throw new ScreenshotRecognitionServiceError(
        "RECOGNITION_JOB_NOT_FOUND",
        "Recognition task not found",
        404,
      );
    }
    database.transaction((tx) => {
      const transactionalDatabase = tx as unknown as Database;
      const acquired = transactionalDatabase
        .update(recognitionJobs)
        .set({ updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(recognitionJobs.id, jobId),
            eq(recognitionJobs.userId, userId),
            eq(recognitionJobs.status, "reviewing"),
          ),
        )
        .returning({ id: recognitionJobs.id })
        .all();
      if (!acquired.length) {
        throw new ScreenshotRecognitionServiceError(
          "RECOGNITION_JOB_NOT_EDITABLE",
          "This recognition task cannot be edited",
          409,
        );
      }
      const item = transactionalDatabase
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
      let effectiveDecision: typeof item.decision = decision;
      let duplicateStatus = item.duplicateStatus;
      let duplicateTransactionId = item.duplicateTransactionId;
      let assessmentDigest = item.duplicateAssessmentDigest;
      let warnings = item.warnings;
      if (decision !== "skip") {
        const complete = confirmableReceiptDataSchema.safeParse(item.normalizedData);
        if (!complete.success || item.validationErrors.length) {
          throw new ScreenshotRecognitionServiceError(
            "RECOGNITION_ITEM_INVALID",
            "Complete and save required fields first",
            422,
          );
        }
        const externalDuplicate = createDeduplicationService(
          transactionalDatabase,
        ).check(userId, deduplicationInput(complete.data));
        const batchDuplicate =
          externalDuplicate.status === "unique"
            ? findBatchDuplicate(
                transactionalDatabase,
                userId,
                jobId,
                itemId,
                complete.data,
              )
            : null;
        duplicateStatus = batchDuplicate || externalDuplicate.status;
        duplicateTransactionId = externalDuplicate.transactionId;
        assessmentDigest =
          !batchDuplicate && externalDuplicate.status === "possible_duplicate"
            ? duplicateAssessmentDigest(toDuplicateAssessment(externalDuplicate))
            : null;
        const duplicateMessage = batchDuplicate
          ? batchDuplicate === "duplicate"
            ? "Identical transaction to another screenshot in this batch"
            : "Similar amount, merchant, and time to another screenshot in this batch"
          : externalDuplicate.reason;
        warnings = item.warnings.filter(
          (warning) => !/duplicate|identical|重复|完全相同/iu.test(warning),
        );
        if (duplicateMessage) warnings.push(duplicateMessage);

        if (decision === "import") {
          effectiveDecision =
            duplicateStatus === "duplicate"
              ? "skip"
              : duplicateStatus === "possible_duplicate"
                ? "pending"
                : "import";
        } else if (duplicateStatus === "duplicate") {
          effectiveDecision = "skip";
        } else if (duplicateStatus !== "possible_duplicate") {
          throw new ScreenshotRecognitionServiceError(
            "DUPLICATE_OVERRIDE_INVALID",
            "Only possible duplicates can be marked to import anyway",
            422,
          );
        }
      }
      transactionalDatabase
        .update(recognitionItems)
        .set({
          decision: effectiveDecision,
          duplicateStatus,
          duplicateTransactionId,
          duplicateAssessmentDigest: assessmentDigest,
          warnings,
          resultCode: null,
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
    });
    return getItem(userId, jobId, itemId);
  }

  return { updateItem, setDecision };
}
