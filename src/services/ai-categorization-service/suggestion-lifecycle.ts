import { aiCategoryInputDigest } from "@/services/ai-categorization-service/schema";
import type {
  AiCategoryInput,
  StoredAiCategorySuggestion,
} from "@/services/ai-categorization-service/types";

const refreshableSuggestionStatuses = new Set<
  StoredAiCategorySuggestion["status"]
>(["auto_applied", "needs_review"]);

export function isAiCategorySuggestionStale(
  suggestion: StoredAiCategorySuggestion | null | undefined,
  configurationFingerprint: string,
) {
  return Boolean(
    suggestion &&
      refreshableSuggestionStatuses.has(suggestion.status) &&
      suggestion.configurationFingerprint !== configurationFingerprint,
  );
}

export function isAiCategorySuggestionCurrent(
  suggestion: StoredAiCategorySuggestion,
  input: AiCategoryInput,
  configurationFingerprint: string,
) {
  return (
    suggestion.configurationFingerprint === configurationFingerprint &&
    suggestion.inputDigest === aiCategoryInputDigest(input)
  );
}
