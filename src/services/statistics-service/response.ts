import type { Database } from "@/db/client";

import {
  aggregateRows,
  categoryAggregateRows,
  currencyAggregateRows,
  currentMonthTransactionRows,
  listRecentTransactions,
  sourceAggregateRows,
  trailingMonthAggregateRows,
} from "./queries";
import {
  calculateMonthChange,
  summarize,
  type AggregateRow,
} from "./summary";
import {
  getMonthRange,
  getTrailingMonthRanges,
  localDateKey,
  monthLabel,
  parseMonth,
  StatisticsInputError,
} from "./time-range";

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const CATEGORY_COLORS = [
  "#059669",
  "#0d9488",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#64748b",
] as const;

export type StatisticsQueryInput = {
  userId: string;
  month: string;
  timeZone: string;
  currency?: string;
};

function buildSummaryPayload(
  database: Database,
  input: StatisticsQueryInput,
) {
  const currency = (input.currency ?? "CNY").toUpperCase();
  if (!CURRENCY_PATTERN.test(currency)) {
    throw new StatisticsInputError("Currency must be three uppercase letters");
  }
  const range = getMonthRange(input.month, input.timeZone);
  const previousRows = aggregateRows(
    database,
    input.userId,
    range.previousStart,
    range.start,
    currency,
  );
  const currencyRows = currencyAggregateRows(
    database,
    input.userId,
    range.start,
    range.end,
  );
  const currentRows = currencyRows.filter((row) => row.currency === currency);
  const summary = summarize(currentRows);
  const previousSummary = summarize(previousRows);
  const groupedCurrencies = new Map<string, AggregateRow[]>();
  for (const row of currencyRows) {
    const rows = groupedCurrencies.get(row.currency) ?? [];
    rows.push(row);
    groupedCurrencies.set(row.currency, rows);
  }
  if (!groupedCurrencies.has(currency)) groupedCurrencies.set(currency, []);
  const currencyBreakdown = [...groupedCurrencies]
    .map(([code, rows]) => ({ currency: code, summary: summarize(rows) }))
    .sort((left, right) =>
      left.currency === currency
        ? -1
        : right.currency === currency
          ? 1
          : left.currency.localeCompare(right.currency),
    );

  return {
    month: input.month,
    timeZone: input.timeZone,
    currency,
    range,
    currentRows,
    previousRows,
    summary,
    previousSummary,
    changes: {
      netExpense: calculateMonthChange(
        summary.netExpenseMinor,
        previousSummary.netExpenseMinor,
      ),
      income: calculateMonthChange(
        summary.incomeMinor,
        previousSummary.incomeMinor,
      ),
      balance: calculateMonthChange(
        summary.balanceMinor,
        previousSummary.balanceMinor,
      ),
    },
    currencyBreakdown,
    excludedCurrencies: currencyBreakdown.filter(
      (item) => item.currency !== currency,
    ),
    recentTransactions: listRecentTransactions(database, input.userId),
  };
}

export function createStatisticsResponses(database: Database) {
  function overview(input: StatisticsQueryInput) {
    const core = buildSummaryPayload(database, input);
    const { currency, range, summary, previousSummary } = core;

    const categoryDistribution = categoryAggregateRows(
      database,
      input.userId,
      currency,
      range.start,
      range.end,
    ).map((row, index) => ({
      categoryId: row.categoryId,
      name: row.categoryName ?? "Uncategorized",
      icon: row.categoryIcon,
      color: row.categoryColor ?? CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      amountMinor: Number(row.amountMinor),
      transactionCount: Number(row.transactionCount),
      sharePercent:
        summary.grossExpenseMinor === 0
          ? 0
          : Math.round(
              (Number(row.amountMinor) / summary.grossExpenseMinor) * 10_000,
            ) / 100,
    }));

    const sourceDistribution = sourceAggregateRows(
      database,
      input.userId,
      currency,
      range.start,
      range.end,
    ).map((row) => ({
      source: row.source,
      amountMinor: Number(row.amountMinor),
      transactionCount: Number(row.transactionCount),
      sharePercent:
        summary.grossExpenseMinor === 0
          ? 0
          : Math.round(
              (Number(row.amountMinor) / summary.grossExpenseMinor) * 10_000,
            ) / 100,
    }));

    const currentRows = currentMonthTransactionRows(
      database,
      input.userId,
      currency,
      range.start,
      range.end,
    );
    const calendarMonth = parseMonth(input.month);
    const dayCount = new Date(
      Date.UTC(calendarMonth.year, calendarMonth.month, 0),
    ).getUTCDate();
    const dailyMap = new Map<string, AggregateRow[]>();
    const largestExpenseByDay = new Map<string, (typeof currentRows)[number]>();
    for (const row of currentRows) {
      const key = localDateKey(row.transactionTime, input.timeZone);
      const rows = dailyMap.get(key) ?? [];
      rows.push({
        type: row.type,
        totalMinor: row.amountMinor,
        transactionCount: 1,
      });
      dailyMap.set(key, rows);
      if (row.type === "expense") {
        const largest = largestExpenseByDay.get(key);
        if (!largest || row.amountMinor > largest.amountMinor) {
          largestExpenseByDay.set(key, row);
        }
      }
    }
    const dailyTrend = Array.from({ length: dayCount }, (_, index) => {
      const day = index + 1;
      const key = `${input.month}-${String(day).padStart(2, "0")}`;
      return {
        date: key,
        label: String(day),
        ...summarize(dailyMap.get(key) ?? []),
      };
    });

    const peakDay = dailyTrend.reduce<(typeof dailyTrend)[number] | null>(
      (peak, day) =>
        day.netExpenseMinor > (peak?.netExpenseMinor ?? 0) ? day : peak,
      null,
    );
    const peakExpense = peakDay ? largestExpenseByDay.get(peakDay.date) : undefined;
    const peakSpendingDay = peakDay
      ? {
          date: peakDay.date,
          netExpenseMinor: peakDay.netExpenseMinor,
          expenseCount: peakDay.expenseCount,
          topExpense: peakExpense
            ? {
                transactionId: peakExpense.id,
                merchantName: peakExpense.merchantName,
                amountMinor: peakExpense.amountMinor,
              }
            : null,
        }
      : null;

    const monthRanges = getTrailingMonthRanges(input.month, input.timeZone);
    const monthlyRows = trailingMonthAggregateRows(
      database,
      input.userId,
      currency,
      monthRanges,
    );
    const rowsByMonth = new Map<string, AggregateRow[]>();
    for (const row of monthlyRows) {
      const rows = rowsByMonth.get(row.month) ?? [];
      rows.push(row);
      rowsByMonth.set(row.month, rows);
    }
    const monthlyTrend = monthRanges.map(({ month }) => ({
      month,
      label: monthLabel(month),
      ...summarize(rowsByMonth.get(month) ?? []),
    }));

    return {
      month: core.month,
      timeZone: core.timeZone,
      currency: core.currency,
      range: { start: range.start, end: range.end },
      summary,
      previousSummary,
      changes: core.changes,
      currencyBreakdown: core.currencyBreakdown,
      excludedCurrencies: core.excludedCurrencies,
      categoryDistribution,
      sourceDistribution,
      dailyTrend,
      peakSpendingDay,
      monthlyTrend,
      recentTransactions: core.recentTransactions,
    };
  }

  function dashboard(input: StatisticsQueryInput) {
    const core = buildSummaryPayload(database, input);
    return {
      month: core.month,
      timeZone: core.timeZone,
      currency: core.currency,
      range: { start: core.range.start, end: core.range.end },
      summary: core.summary,
      previousSummary: core.previousSummary,
      changes: core.changes,
      currencyBreakdown: core.currencyBreakdown,
      excludedCurrencies: core.excludedCurrencies,
      recentTransactions: core.recentTransactions,
    };
  }

  return { overview, dashboard };
}
