import { describe, expect, it } from "vitest";

import { compatibleHistoricalCategory } from "./historical-ai-review-model";

describe("compatibleHistoricalCategory", () => {
  it("excludes the built-in Other category by key, in any language", () => {
    expect(compatibleHistoricalCategory({ id: "u:category:other", name: "其他", kind: "both", builtInKey: "other" }, "expense")).toBe(false);
    expect(compatibleHistoricalCategory({ id: "u:category:other", name: "Other", kind: "both", builtInKey: "other" }, "income")).toBe(false);
    // A custom category that happens to be called "Other" is a real target.
    expect(compatibleHistoricalCategory({ id: "custom", name: "Other", kind: "expense", builtInKey: null }, "expense")).toBe(true);
  });

  it("keeps only categories whose kind fits the transaction", () => {
    const food = { id: "u:category:food", name: "餐饮", kind: "expense" as const, builtInKey: "food" };
    expect(compatibleHistoricalCategory(food, "expense")).toBe(true);
    expect(compatibleHistoricalCategory(food, "income")).toBe(false);
  });
});
