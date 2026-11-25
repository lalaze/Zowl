import { db, type Database } from "@/db/client";
import {
  createAiCategorizationSettingsService,
  type AiCategorizationRuntime,
  type AiCategorizationRuntimeResolver,
} from "@/services/ai-categorization-service";
import {
  createLocalFileStorage,
  type FileStorage,
} from "@/services/file-storage-service";
import type { ReceiptRecognitionProvider } from "@/services/receipt-recognition-service";
import { createScreenshotAiCategorizationWorkflow } from "@/services/screenshot-recognition-service/ai-categorization";
import { createScreenshotAutomaticPostingWorkflow } from "@/services/screenshot-recognition-service/automatic-posting";
import { createScreenshotPostingWorkflow } from "@/services/screenshot-recognition-service/posting";
import { createScreenshotReviewCommands } from "@/services/screenshot-recognition-service/review-command";
import { createScreenshotReviewQueries } from "@/services/screenshot-recognition-service/review-query";
import {
  createConfiguredProviderSafely,
  createScreenshotUploadWorkflow,
  MAX_SCREENSHOT_JOB_BYTES,
  MAX_SCREENSHOTS_PER_JOB,
} from "@/services/screenshot-recognition-service/upload";

export { ScreenshotRecognitionServiceError } from "@/services/screenshot-recognition-service/error";
export {
  receiptDecisionSchema,
  receiptItemEditSchema,
  stagedReceiptDataSchema,
} from "@/services/screenshot-recognition-service/schema";

export function createScreenshotRecognitionService(
  database: Database = db,
  storage: FileStorage = createLocalFileStorage(database),
  provider: ReceiptRecognitionProvider = createConfiguredProviderSafely(),
  aiRuntimeSource?: AiCategorizationRuntime | AiCategorizationRuntimeResolver,
) {
  const runtimeSource =
    aiRuntimeSource ??
    createAiCategorizationSettingsService(database).resolveRuntime;
  const aiRuntimeFor = (userId: string) =>
    typeof runtimeSource === "function"
      ? runtimeSource(userId)
      : runtimeSource;

  const aiCategorization = createScreenshotAiCategorizationWorkflow(
    database,
    aiRuntimeFor,
  );
  const reviewQueries = createScreenshotReviewQueries(database, aiRuntimeFor);
  const uploadWorkflow = createScreenshotUploadWorkflow(
    database,
    storage,
    provider,
    reviewQueries.getReview,
  );
  const reviewCommands = createScreenshotReviewCommands(
    database,
    reviewQueries.getItem,
  );
  const posting = createScreenshotPostingWorkflow(
    database,
    aiRuntimeFor,
    aiCategorization,
  );
  const automaticPosting = createScreenshotAutomaticPostingWorkflow(
    reviewQueries.getReview,
    posting.confirm,
  );

  return {
    providerInfo: uploadWorkflow.providerInfo,
    upload: uploadWorkflow.upload,
    getReview: reviewQueries.getReview,
    getItem: reviewQueries.getItem,
    listJobs: reviewQueries.listJobs,
    pendingJobs: reviewQueries.pendingJobs,
    updateItem: reviewCommands.updateItem,
    classifyWithAi: aiCategorization.classifyWithAi,
    adoptAiCategorySuggestion(userId: string, jobId: string, itemId: string) {
      aiCategorization.adoptAiCategorySuggestion(userId, jobId, itemId);
      return reviewQueries.getItem(userId, jobId, itemId);
    },
    getAiCategorizationMetadata: (userId: string) =>
      aiRuntimeFor(userId).metadata,
    setDecision: reviewCommands.setDecision,
    confirm: posting.confirm,
    confirmAutomatically: automaticPosting.confirmIfSafe,
  };
}

export const screenshotRecognitionService =
  createScreenshotRecognitionService();

export const screenshotUploadLimits = {
  count: MAX_SCREENSHOTS_PER_JOB,
  totalBytes: MAX_SCREENSHOT_JOB_BYTES,
};
