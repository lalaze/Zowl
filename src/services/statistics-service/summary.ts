import type { transactions } from "@/db/schema";

export type TransactionType = (typeof transactions.$inferSelect)["type"];

export type AggregateRow = {
  type: TransactionType;
  totalMinor: number;
  transactionCount: number;
};

export type FlowSummary = {
  grossExpenseMinor: number;
  refundMinor: number;
  netExpenseMinor: number;
  incomeMinor: number;
  transferMinor: number;
  balanceMinor: number;
  expenseCount: number;
  refundCount: number;
  incomeCount: number;
  transferCount: number;
  transactionCount: number;
};

export type MonthChange = {
  currentMinor: number;
  previousMinor: number;
  deltaMinor: number;
  ratePercent: number | null;
  status: "up" | "down" | "unchanged" | "new";
};

function emptySummary(): FlowSummary {
  return {
    grossExpenseMinor: 0,
    refundMinor: 0,
    netExpenseMinor: 0,
    incomeMinor: 0,
    transferMinor: 0,
    balanceMinor: 0,
    expenseCount: 0,
    refundCount: 0,
    incomeCount: 0,
    transferCount: 0,
    transactionCount: 0,
  };
}

export function summarize(rows: readonly AggregateRow[]): FlowSummary {
  const summary = emptySummary();
  for (const row of rows) {
    const amount = Number(row.totalMinor ?? 0);
    const count = Number(row.transactionCount ?? 0);
    if (row.type === "expense") {
      summary.grossExpenseMinor += amount;
      summary.expenseCount += count;
    } else if (row.type === "refund") {
      summary.refundMinor += amount;
      summary.refundCount += count;
    } else if (row.type === "income") {
      summary.incomeMinor += amount;
      summary.incomeCount += count;
    } else {
      summary.transferMinor += amount;
      summary.transferCount += count;
    }
    summary.transactionCount += count;
  }
  summary.netExpenseMinor = summary.grossExpenseMinor - summary.refundMinor;
  summary.balanceMinor = summary.incomeMinor - summary.netExpenseMinor;
  return summary;
}

export function calculateMonthChange(
  currentMinor: number,
  previousMinor: number,
): MonthChange {
  const deltaMinor = currentMinor - previousMinor;
  if (previousMinor === 0) {
    return {
      currentMinor,
      previousMinor,
      deltaMinor,
      ratePercent: currentMinor === 0 ? 0 : null,
      status: currentMinor === 0 ? "unchanged" : "new",
    };
  }
  return {
    currentMinor,
    previousMinor,
    deltaMinor,
    ratePercent:
      Math.round((deltaMinor / Math.abs(previousMinor)) * 10_000) / 100,
    status: deltaMinor === 0 ? "unchanged" : deltaMinor > 0 ? "up" : "down",
  };
}
