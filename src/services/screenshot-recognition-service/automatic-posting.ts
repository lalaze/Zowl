import { ScreenshotRecognitionServiceError } from "@/services/screenshot-recognition-service/error";

export const AUTOMATIC_SCREENSHOT_POSTING_MIN_CONFIDENCE = 0.9;

export type AutomaticScreenshotPostingBlocker =
  | "multiple_images"
  | "recognition_failed"
  | "missing_fields"
  | "duplicate_review"
  | "decision_required"
  | "low_confidence"
  | "recognition_warning";

type AutomaticPostingReview = {
  job?: { status: string; importedCount: number; skippedCount: number; failedCount: number };
  items: Array<{
    status: string;
    confidence: number | null;
    validationErrors: unknown[];
    warnings: unknown[];
    duplicateKind: string | null;
    decision: string | null;
    resultTransactionId: string | null;
  }>;
};

type AutomaticPostingConfirmation = {
  jobId: string;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
};

export function automaticPostingBlocker(
  review: AutomaticPostingReview,
): AutomaticScreenshotPostingBlocker | null {
  if (review.items.length !== 1) return "multiple_images";
  const item = review.items[0]!;
  if (item.status !== "recognized") return "recognition_failed";
  if (item.validationErrors.length) return "missing_fields";
  if (item.duplicateKind === "possible_duplicate") return "duplicate_review";
  if (item.decision === "pending" || item.decision === null) {
    return "decision_required";
  }

  // An exact duplicate is already resolved as a safe skip and may complete
  // without trusting the provider confidence or warning text.
  if (item.decision === "skip" && item.duplicateKind === "duplicate") {
    return null;
  }
  if (item.decision !== "import") return "decision_required";
  if (
    item.confidence === null ||
    item.confidence < AUTOMATIC_SCREENSHOT_POSTING_MIN_CONFIDENCE
  ) {
    return "low_confidence";
  }
  if (item.warnings.length) return "recognition_warning";
  return null;
}

export function createScreenshotAutomaticPostingWorkflow(
  getReview: (userId: string, jobId: string) => AutomaticPostingReview,
  confirm: (
    userId: string,
    jobId: string,
  ) => AutomaticPostingConfirmation,
) {
  function confirmIfSafe(userId: string, jobId: string) {
    const review = getReview(userId, jobId);
    if (review.job?.status === "completed") {
      return { status: "completed" as const, jobId,
        createdCount: review.job.importedCount, skippedCount: review.job.skippedCount,
        failedCount: review.job.failedCount,
        transactionIds: review.items.flatMap((item) => item.resultTransactionId ? [item.resultTransactionId] : []),
      };
    }
    const blocker = automaticPostingBlocker(review);
    if (blocker) {
      return {
        status: "needs_review" as const,
        jobId,
        reason: blocker,
      };
    }

    let result: AutomaticPostingConfirmation;
    try {
      result = confirm(userId, jobId);
    } catch (error) {
      if (
        error instanceof ScreenshotRecognitionServiceError &&
        error.code === "DUPLICATE_REVIEW_REQUIRED"
      ) {
        return {
          status: "needs_review" as const,
          jobId,
          reason: "duplicate_review" as const,
        };
      }
      throw error;
    }

    const completed = getReview(userId, jobId);
    return {
      status: "completed" as const,
      ...result,
      transactionIds: completed.items.flatMap((item) =>
        item.resultTransactionId ? [item.resultTransactionId] : [],
      ),
    };
  }

  return { confirmIfSafe };
}
