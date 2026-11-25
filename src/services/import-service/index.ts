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
import { createImportAiCategorizationWorkflow } from "@/services/import-service/ai-categorization";
import { createImportPostingWorkflow } from "@/services/import-service/posting";
import { createImportReviewCommands } from "@/services/import-service/review-command";
import { createImportReviewQueries } from "@/services/import-service/review-query";
import { createImportStagingWorkflow } from "@/services/import-service/staging";

export { ImportServiceError } from "@/services/import-service/error";
export { fieldMappingSchema } from "@/services/import-service/schema";

export function createImportService(
  database: Database = db,
  storage: FileStorage = createLocalFileStorage(database),
  aiRuntimeSource?: AiCategorizationRuntime | AiCategorizationRuntimeResolver,
) {
  const runtimeSource =
    aiRuntimeSource ??
    createAiCategorizationSettingsService(database).resolveRuntime;
  const aiRuntimeFor = (userId: string) =>
    typeof runtimeSource === "function"
      ? runtimeSource(userId)
      : runtimeSource;

  const aiCategorization = createImportAiCategorizationWorkflow(
    database,
    aiRuntimeFor,
  );
  const reviewQueries = createImportReviewQueries(database, aiRuntimeFor);
  const staging = createImportStagingWorkflow(database, storage);
  const reviewCommands = createImportReviewCommands(database);
  const posting = createImportPostingWorkflow(
    database,
    aiRuntimeFor,
    aiCategorization,
    reviewQueries.getReview,
  );

  return {
    upload: staging.upload,
    getReview: reviewQueries.getReview,
    getNextUnresolvedError: reviewQueries.getNextUnresolvedError,
    getNextUnresolvedDuplicate: reviewQueries.getNextUnresolvedDuplicate,
    listBatches: reviewQueries.listBatches,
    updateMapping: staging.updateMapping,
    updateItem: reviewCommands.updateItem,
    setItemDecision: reviewCommands.setItemDecision,
    setEnrichmentResolution: reviewCommands.setEnrichmentResolution,
    classifyWithAi: aiCategorization.classifyWithAi,
    adoptAiCategorySuggestion: aiCategorization.adoptAiCategorySuggestion,
    getAiCategorizationMetadata: (userId: string) =>
      aiRuntimeFor(userId).metadata,
    confirm: posting.confirm,
  };
}

export const importService = createImportService();
