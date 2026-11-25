export { AiCategorizationError } from "@/services/ai-categorization-service/error";
export {
  createAiCategorizationRuntime,
  createSafeAiCategorizationRuntime,
  type AiCategorizationEnvironment,
} from "@/services/ai-categorization-service/factory";
export {
  createAiCategoryEnrichmentService,
  type AiEnrichmentCandidate,
  type AiEnrichmentResult,
} from "@/services/ai-categorization-service/enrichment";
export {
  createOrderDetailsService,
  type OrderDetailsExtraction,
  type OrderDetailsOutcome,
} from "@/services/ai-categorization-service/order-details";
export {
  ORDER_CONTEXT_MAX_LINE_LENGTH,
  ORDER_CONTEXT_MAX_LINES,
  ORDER_CONTEXT_MAX_PAGES,
  orderContextSchema,
  orderDetailsJsonSchema,
  parseOrderDetailsResult,
  sanitizeOrderDetailsInput,
} from "@/services/ai-categorization-service/order-details-schema";
export {
  createHistoricalAiReclassificationService,
  historicalAiApplySchema,
  historicalAiPreviewSchema,
  historicalAiReclassificationService,
  type HistoricalAiApplyInput,
} from "@/services/ai-categorization-service/historical-reclassification";
export {
  MAX_AI_PROVIDER_RESPONSE_BYTES,
  OpenAiCompatibleCategorizationProvider,
  isLoopbackAiProviderHostname,
  isPrivateAiProviderHostname,
  type OpenAiCompatibleCategorizationProviderOptions,
} from "@/services/ai-categorization-service/openai-compatible-provider";
export {
  aiCategorizationConnectionTestSchema,
  aiCategorizationSettingsInputSchema,
  aiCategorizationSettingsService,
  createAiCategorizationSettingsService,
  resolveAiCategorizationRuntime,
  type AiCategorizationConnectionTestInput,
  type AiCategorizationSettingsInput,
  type AiCategorizationSettingsState,
} from "@/services/ai-categorization-service/settings";
export {
  aiCategoryBatchInputSchema,
  aiCategoryInputDigest,
  aiCategoryResultsJsonSchema,
  parseAiCategoryResults,
  sanitizeAiCategoryBatchInput,
  sanitizeAiCategoryText,
  storedAiCategorySuggestionSchema,
} from "@/services/ai-categorization-service/schema";
export {
  isAiCategorySuggestionCurrent,
  isAiCategorySuggestionStale,
} from "@/services/ai-categorization-service/suggestion-lifecycle";
export type {
  AiCategorizationProvider,
  AiCategorizationProviderMetadata,
  AiCategorizationRuntime,
  AiCategorizationRuntimeResolver,
  AiCategoryBatchInput,
  AiCategoryInput,
  AiCategoryOption,
  AiCategoryResult,
  OrderContextPage,
  OrderDetailsInput,
  OrderDetailsResult,
  StoredAiCategorySuggestion,
} from "@/services/ai-categorization-service/types";
