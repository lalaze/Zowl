import type { categoryKinds, transactionTypes } from "@/db/schema";

type CategoryKind = (typeof categoryKinds)[number];
type TransactionType = (typeof transactionTypes)[number];

export function categoryKindSupportsTransaction(
  kind: CategoryKind,
  type: TransactionType,
) {
  if (kind === "both") return true;
  return type === "income" || type === "refund"
    ? kind === "income"
    : kind === "expense";
}
