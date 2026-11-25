import { formatMoney } from "@/lib/money";

export type HistoricalCategoryOption = {
  id: string;
  name: string;
  kind: "expense" | "income" | "both";
  /** Built-in category key ("other", "food", …), null for custom categories. */
  builtInKey: string | null;
};

export type HistoricalGroup = {
  id: string;
  type: "expense" | "income";
  merchantName: string | null;
  description: string | null;
  transactionCount: number;
  amounts: Record<string, number>;
  latestTransactionTime: string;
  members: Array<{
    transactionId: string;
    expectedRevisionId: string;
  }>;
  suggestion: {
    categoryId: string | null;
    categoryName: string | null;
    confidence: number;
    ambiguous: boolean;
    reason: string;
    status: "auto_applied" | "needs_review" | "adopted" | "overridden";
  } | null;
};

export type HistoricalSelection = {
  selected: boolean;
  categoryId: string;
  learnCategoryRule: boolean;
};

export type HistoricalPreviewResult = {
  enabled: boolean;
  failed: boolean;
  errorCode: string | null;
  groups: HistoricalGroup[];
  totalGroups: number;
  nextCursor: number | null;
};

export type HistoricalApplyResult = {
  appliedCount: number;
  conflictCount: number;
  failedCount: number;
};

export function compatibleHistoricalCategory(
  category: HistoricalCategoryOption,
  type: HistoricalGroup["type"],
) {
  // Groups are made of "Other" transactions; moving them to Other is a no-op.
  return (
    category.builtInKey !== "other" &&
    (category.kind === "both" || category.kind === type)
  );
}

export function historicalAmountLabel(amounts: Record<string, number>) {
  return Object.entries(amounts)
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(" + ");
}

export function initialHistoricalSelections(groups: HistoricalGroup[]) {
  return Object.fromEntries(
    groups.map((group) => {
      const suggestion = group.suggestion;
      const highConfidence =
        suggestion?.status === "auto_applied" &&
        Boolean(suggestion.categoryId) &&
        !suggestion.ambiguous;
      return [
        group.id,
        {
          selected: highConfidence,
          categoryId: suggestion?.categoryId ?? "",
          learnCategoryRule: false,
        } satisfies HistoricalSelection,
      ];
    }),
  );
}
