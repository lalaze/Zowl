import { describe, expect, it } from "vitest";

import {
  isAiCategorySuggestionCurrent,
  isAiCategorySuggestionStale,
} from "@/services/ai-categorization-service/suggestion-lifecycle";
import { aiCategoryInputDigest } from "@/services/ai-categorization-service/schema";
import type {
  AiCategoryInput,
  StoredAiCategorySuggestion,
} from "@/services/ai-categorization-service/types";

const input: AiCategoryInput = {
  itemRef: "item-1",
  type: "expense",
  source: "screenshot",
  merchantName: "Joy Shop",
  description: "Default item",
};

function suggestion(
  overrides: Partial<StoredAiCategorySuggestion> = {},
): StoredAiCategorySuggestion {
  return {
    itemRef: input.itemRef,
    categoryId: "food",
    categoryName: "Food",
    confidence: 0.9,
    ambiguous: false,
    reason: "Food merchant",
    inputDigest: aiCategoryInputDigest(input),
    model: "test-model",
    configurationFingerprint: "1".repeat(64),
    status: "auto_applied",
    ...overrides,
  };
}

describe("AI category suggestion lifecycle", () => {
  it("invalidates only unadopted suggestions when configuration changes", () => {
    expect(
      isAiCategorySuggestionStale(suggestion(), "2".repeat(64)),
    ).toBe(true);
    expect(
      isAiCategorySuggestionStale(
        suggestion({ status: "needs_review" }),
        "2".repeat(64),
      ),
    ).toBe(true);
    expect(
      isAiCategorySuggestionStale(
        suggestion({ status: "adopted" }),
        "2".repeat(64),
      ),
    ).toBe(false);
  });

  it("matches both the sanitized input digest and current configuration", () => {
    expect(
      isAiCategorySuggestionCurrent(suggestion(), input, "1".repeat(64)),
    ).toBe(true);
    expect(
      isAiCategorySuggestionCurrent(
        suggestion(),
        { ...input, merchantName: "Another shop" },
        "1".repeat(64),
      ),
    ).toBe(false);
    expect(
      isAiCategorySuggestionCurrent(suggestion(), input, "2".repeat(64)),
    ).toBe(false);
  });
});
