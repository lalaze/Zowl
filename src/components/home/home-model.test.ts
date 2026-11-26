import { describe, expect, it } from "vitest";

import type { StatisticsOverview } from "@/services/statistics-service";

import {
  buildHomeModel,
  SAVINGS_GOAL_MINOR,
  STREAK_DAYS,
} from "./home-model";

function makeOverview(
  overrides: Partial<StatisticsOverview> = {},
): StatisticsOverview {
  return {
    month: "2026-07",
    currency: "CNY",
    timeZone: "Asia/Shanghai",
    range: {
      start: "2026-06-30T16:00:00.000Z",
      end: "2026-07-31T16:00:00.000Z",
    },
    summary: {
      incomeMinor: 1_200_000,
      grossExpenseMinor: 400_000,
      refundMinor: 0,
      netExpenseMinor: 400_000,
      transferMinor: 0,
      balanceMinor: 800_000,
      expenseCount: 4,
      refundCount: 0,
      incomeCount: 1,
      transferCount: 0,
      transactionCount: 5,
    },
    previousSummary: {
      incomeMinor: 1_000_000,
      grossExpenseMinor: 500_000,
      refundMinor: 0,
      netExpenseMinor: 500_000,
      transferMinor: 0,
      balanceMinor: 500_000,
      expenseCount: 5,
      refundCount: 0,
      incomeCount: 1,
      transferCount: 0,
      transactionCount: 6,
    },
    changes: {
      income: {
        currentMinor: 1_200_000,
        previousMinor: 1_000_000,
        deltaMinor: 200_000,
        ratePercent: 20,
        status: "up",
      },
      netExpense: {
        currentMinor: 400_000,
        previousMinor: 500_000,
        deltaMinor: -100_000,
        ratePercent: -20,
        status: "down",
      },
      balance: {
        currentMinor: 800_000,
        previousMinor: 500_000,
        deltaMinor: 300_000,
        ratePercent: 60,
        status: "up",
      },
    },
    dailyTrend: Array.from({ length: 31 }, (_, index) => ({
      date: `2026-07-${String(index + 1).padStart(2, "0")}`,
      label: `07-${String(index + 1).padStart(2, "0")}`,
      incomeMinor: 0,
      grossExpenseMinor: 0,
      refundMinor: 0,
      netExpenseMinor: 0,
      transferMinor: 0,
      balanceMinor: 0,
      expenseCount: 0,
      refundCount: 0,
      incomeCount: 0,
      transferCount: 0,
      transactionCount: index < 25 ? 1 : 0,
    })),
    monthlyTrend: [],
    categoryDistribution: [],
    sourceDistribution: [],
    currencyBreakdown: [],
    excludedCurrencies: [],
    recentTransactions: [],
    peakSpendingDay: null,
    ...overrides,
  };
}

describe("buildHomeModel", () => {
  it("computes greeting, clamped streak dots, savings, comparisons, and pending count", () => {
    // 2026-07-25T01:30:00Z is 09:30 on July 25 in Asia/Shanghai.
    const model = buildHomeModel({
      overview: makeOverview(),
      now: new Date("2026-07-25T01:30:00Z"),
      displayName: "  Ada Lovelace ",
      timeZone: "Asia/Shanghai",
      locale: "en",
      reminderJobsCount: 1,
      reminderBatchesCount: 2,
      notificationCount: 3,
    });

    expect(STREAK_DAYS).toBe(21);
    expect(SAVINGS_GOAL_MINOR).toBe(1_000_000);
    expect(model.hour).toBe(9);
    expect(model.sceneTime).toBe("day");
    expect(model.firstName).toBe("Ada");
    expect(model.greetingHeading).toBe("Good morning, Ada");
    expect(model.dateHeading).toContain("July");
    expect(model.checkedDays).toBe(25);
    expect(model.litDots).toBe(21);
    expect(model.savingsMinor).toBe(800_000);
    expect(model.savingsRatio).toBeCloseTo(800_000 / 1_200_000);
    expect(model.savingsPercent).toBe(80);
    expect(model.expenseComparison).toBe(
      "Net spending compared with last month: decreased 20%",
    );
    expect(model.balanceImproved).toBe(true);
    expect(model.balanceChangeText).toBe("▲ vs. last month +60%");
    expect(model.pendingCount).toBe(6);
  });

  it("handles zero income, negative savings, blank display name, and Chinese copy", () => {
    const overview = makeOverview({
      summary: {
        incomeMinor: 0,
        grossExpenseMinor: 25_000,
        refundMinor: 0,
        netExpenseMinor: 25_000,
        transferMinor: 0,
        balanceMinor: -25_000,
        expenseCount: 1,
        refundCount: 0,
        incomeCount: 0,
        transferCount: 0,
        transactionCount: 1,
      },
      changes: {
        income: {
          currentMinor: 0,
          previousMinor: 0,
          deltaMinor: 0,
          ratePercent: null,
          status: "new",
        },
        netExpense: {
          currentMinor: 25_000,
          previousMinor: 0,
          deltaMinor: 25_000,
          ratePercent: null,
          status: "new",
        },
        balance: {
          currentMinor: -25_000,
          previousMinor: 10_000,
          deltaMinor: -35_000,
          ratePercent: -350,
          status: "down",
        },
      },
    });

    // 2026-07-03T13:00:00Z is 21:00 on July 3 in Asia/Shanghai.
    const model = buildHomeModel({
      overview,
      now: new Date("2026-07-03T13:00:00Z"),
      displayName: "   ",
      timeZone: "Asia/Shanghai",
      locale: "zh",
      reminderJobsCount: 0,
      reminderBatchesCount: 0,
      notificationCount: 0,
    });

    expect(model.hour).toBe(21);
    expect(model.sceneTime).toBe("night");
    expect(model.firstName).toBe("");
    expect(model.greetingHeading).toBe("晚上好");
    expect(model.dateHeading).toContain("7月");
    expect(model.checkedDays).toBe(3);
    expect(model.litDots).toBe(3);
    expect(model.savingsMinor).toBe(-25_000);
    expect(model.savingsRatio).toBeNull();
    expect(model.savingsPercent).toBe(0);
    expect(model.expenseComparison).toBe("上月净支出为 0，暂无环比");
    expect(model.balanceImproved).toBe(false);
    expect(model.balanceChangeText).toBe("▼ 较上月 −350%");
    expect(model.pendingCount).toBe(0);
  });
});
