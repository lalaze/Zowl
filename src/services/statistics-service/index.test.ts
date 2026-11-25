import path from "node:path";

import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import * as databaseSchema from "@/db/schema";
import { categories, transactions, users } from "@/db/schema";
import {
  calculateMonthChange,
  createStatisticsService,
  getMonthRange,
} from "@/services/statistics-service";

describe("statistics service", () => {
  let database: ReturnType<typeof createDatabase>;
  let service: ReturnType<typeof createStatisticsService>;
  let sequence = 0;

  beforeEach(() => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    const now = "2026-07-15T00:00:00.000Z";
    database.db.insert(users).values([
      {
        id: "user-a",
        email: "a@example.com",
        passwordHash: "test",
        displayName: "A",
        timezone: "Asia/Shanghai",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "user-b",
        email: "b@example.com",
        passwordHash: "test",
        displayName: "B",
        timezone: "Asia/Shanghai",
        createdAt: now,
        updatedAt: now,
      },
    ]).run();
    database.db.insert(categories).values([
      {
        id: "food-a",
        userId: "user-a",
        name: "Food",
        kind: "expense",
        icon: "Utensils",
        color: "#f97316",
        isSystem: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "travel-a",
        userId: "user-a",
        name: "Transport",
        kind: "expense",
        icon: "Train",
        color: "#3b82f6",
        isSystem: true,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "food-b",
        userId: "user-b",
        name: "User B private category",
        kind: "expense",
        icon: "Tags",
        color: "#000000",
        isSystem: false,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]).run();
    service = createStatisticsService(database.db);
  });

  afterEach(() => database.sqlite.close());

  function addTransaction(input: {
    userId?: string;
    type?: "expense" | "income" | "transfer" | "refund";
    amountMinor: number;
    currency?: string;
    categoryId?: string | null;
    source?: "manual" | "screenshot" | "alipay" | "wechat" | "cmb" | "other";
    transactionTime: string;
    voidedAt?: string | null;
  }) {
    sequence += 1;
    const id = `transaction-${sequence}`;
    database.db.insert(transactions).values({
      id,
      userId: input.userId ?? "user-a",
      type: input.type ?? "expense",
      amountMinor: input.amountMinor,
      currency: input.currency ?? "CNY",
      merchantName: id,
      categoryId: input.categoryId ?? null,
      transactionTime: input.transactionTime,
      createdAt: input.transactionTime,
      updatedAt: input.transactionTime,
      source: input.source ?? "manual",
      fingerprint: `fingerprint-${sequence}`,
      duplicateStatus: "unique",
      needsReview: false,
      voidedAt: input.voidedAt ?? null,
    }).run();
    return id;
  }

  it("excludes voided Transactions from every normal statistics projection", () => {
    addTransaction({
      amountMinor: 1_000,
      categoryId: "food-a",
      source: "alipay",
      transactionTime: "2026-07-10T04:00:00.000Z",
    });
    addTransaction({
      amountMinor: 9_000,
      categoryId: "travel-a",
      source: "screenshot",
      transactionTime: "2026-07-11T04:00:00.000Z",
      voidedAt: "2026-07-12T00:00:00.000Z",
    });

    const result = service.overview({
      userId: "user-a",
      month: "2026-07",
      timeZone: "Asia/Shanghai",
    });

    expect(result.summary.grossExpenseMinor).toBe(1_000);
    expect(result.summary.transactionCount).toBe(1);
    expect(result.categoryDistribution.map((row) => row.name)).toEqual(["Food"]);
    expect(result.sourceDistribution).toEqual([
      {
        source: "alipay",
        amountMinor: 1_000,
        transactionCount: 1,
        sharePercent: 100,
      },
    ]);
    expect(result.dailyTrend[10]!.grossExpenseMinor).toBe(0);
    expect(result.recentTransactions).toHaveLength(1);
    expect(result.recentTransactions[0]).toMatchObject({ source: "alipay" });
  });

  it("uses the user's timezone for inclusive month start and exclusive month end", () => {
    addTransaction({ amountMinor: 100, transactionTime: "2026-06-30T15:59:59.999Z" });
    addTransaction({ amountMinor: 200, transactionTime: "2026-06-30T16:00:00.000Z" });
    addTransaction({ amountMinor: 300, transactionTime: "2026-07-31T15:59:59.999Z" });
    addTransaction({ amountMinor: 400, transactionTime: "2026-07-31T16:00:00.000Z" });
    addTransaction({ userId: "user-b", amountMinor: 900, transactionTime: "2026-07-15T00:00:00.000Z" });

    const result = service.overview({
      userId: "user-a",
      month: "2026-07",
      timeZone: "Asia/Shanghai",
    });

    expect(result.range).toEqual({
      start: "2026-06-30T16:00:00.000Z",
      end: "2026-07-31T16:00:00.000Z",
    });
    expect(result.summary.grossExpenseMinor).toBe(500);
    expect(result.dailyTrend[0].grossExpenseMinor).toBe(200);
    expect(result.dailyTrend[30].grossExpenseMinor).toBe(300);
  });

  it("handles a daylight-saving timezone when calculating month boundaries", () => {
    expect(getMonthRange("2026-03", "America/New_York")).toMatchObject({
      start: "2026-03-01T05:00:00.000Z",
      end: "2026-04-01T04:00:00.000Z",
      previousStart: "2026-02-01T05:00:00.000Z",
    });
  });

  it("treats refunds as expense offsets and excludes transfers from income and expense", () => {
    addTransaction({ type: "expense", amountMinor: 10_000, categoryId: "food-a", transactionTime: "2026-07-10T04:00:00.000Z" });
    addTransaction({ type: "refund", amountMinor: 2_000, transactionTime: "2026-07-11T04:00:00.000Z" });
    addTransaction({ type: "income", amountMinor: 50_000, transactionTime: "2026-07-12T04:00:00.000Z" });
    addTransaction({ type: "transfer", amountMinor: 30_000, transactionTime: "2026-07-13T04:00:00.000Z" });

    const result = service.overview({ userId: "user-a", month: "2026-07", timeZone: "Asia/Shanghai" });

    expect(result.summary).toMatchObject({
      grossExpenseMinor: 10_000,
      refundMinor: 2_000,
      netExpenseMinor: 8_000,
      incomeMinor: 50_000,
      transferMinor: 30_000,
      balanceMinor: 42_000,
      transactionCount: 4,
    });
    expect(result.categoryDistribution).toHaveLength(1);
    expect(result.categoryDistribution[0]).toMatchObject({
      name: "Food",
      icon: "Utensils",
      amountMinor: 10_000,
      sharePercent: 100,
    });
  });

  it("keeps currencies separate and explicitly reports currencies excluded from CNY", () => {
    addTransaction({ type: "expense", amountMinor: 1_000, currency: "CNY", transactionTime: "2026-07-10T04:00:00.000Z" });
    addTransaction({ type: "expense", amountMinor: 2_500, currency: "USD", transactionTime: "2026-07-10T04:00:00.000Z" });
    addTransaction({ type: "income", amountMinor: 4_000, currency: "USD", transactionTime: "2026-07-11T04:00:00.000Z" });

    const result = service.overview({ userId: "user-a", month: "2026-07", timeZone: "Asia/Shanghai" });

    expect(result.currency).toBe("CNY");
    expect(result.summary.grossExpenseMinor).toBe(1_000);
    expect(result.excludedCurrencies).toEqual([
      expect.objectContaining({
        currency: "USD",
        summary: expect.objectContaining({ grossExpenseMinor: 2_500, incomeMinor: 4_000 }),
      }),
    ]);
  });

  it("groups only gross expenses by source and keeps another user's rows out", () => {
    addTransaction({ type: "expense", source: "alipay", amountMinor: 1_000, transactionTime: "2026-07-10T04:00:00.000Z" });
    addTransaction({ type: "expense", source: "screenshot", amountMinor: 3_000, transactionTime: "2026-07-11T04:00:00.000Z" });
    addTransaction({ type: "refund", source: "alipay", amountMinor: 500, transactionTime: "2026-07-12T04:00:00.000Z" });
    addTransaction({ type: "transfer", source: "wechat", amountMinor: 8_000, transactionTime: "2026-07-13T04:00:00.000Z" });
    addTransaction({ userId: "user-b", type: "expense", source: "alipay", amountMinor: 99_000, transactionTime: "2026-07-14T04:00:00.000Z" });

    const result = service.overview({ userId: "user-a", month: "2026-07", timeZone: "Asia/Shanghai" });

    expect(result.sourceDistribution).toEqual([
      { source: "screenshot", amountMinor: 3_000, transactionCount: 1, sharePercent: 75 },
      { source: "alipay", amountMinor: 1_000, transactionCount: 1, sharePercent: 25 },
    ]);
  });

  it("does not expose a cross-user category name through distribution or recent rows", () => {
    addTransaction({
      amountMinor: 1_000,
      categoryId: "food-b",
      transactionTime: "2026-07-10T04:00:00.000Z",
    });

    const result = service.overview({ userId: "user-a", month: "2026-07", timeZone: "Asia/Shanghai" });

    expect(result.categoryDistribution[0]?.name).toBe("Uncategorized");
    expect(result.recentTransactions[0]?.categoryName).toBeNull();
  });

  it("reports the peak net-spending day with its largest expense", () => {
    addTransaction({ amountMinor: 1_000, transactionTime: "2026-07-10T04:00:00.000Z" });
    const largest = addTransaction({ amountMinor: 3_000, transactionTime: "2026-07-10T05:00:00.000Z" });
    addTransaction({ type: "refund", amountMinor: 500, transactionTime: "2026-07-10T06:00:00.000Z" });
    addTransaction({ amountMinor: 3_400, transactionTime: "2026-07-11T04:00:00.000Z" });
    addTransaction({ type: "income", amountMinor: 90_000, transactionTime: "2026-07-12T04:00:00.000Z" });
    addTransaction({ amountMinor: 50_000, currency: "USD", transactionTime: "2026-07-13T04:00:00.000Z" });
    addTransaction({
      amountMinor: 80_000,
      transactionTime: "2026-07-14T04:00:00.000Z",
      voidedAt: "2026-07-14T05:00:00.000Z",
    });

    const result = service.overview({ userId: "user-a", month: "2026-07", timeZone: "Asia/Shanghai" });

    expect(result.peakSpendingDay).toEqual({
      date: "2026-07-10",
      netExpenseMinor: 3_500,
      expenseCount: 2,
      topExpense: { transactionId: largest, merchantName: largest, amountMinor: 3_000 },
    });
  });

  it("omits the peak spending day when the month has no net spending", () => {
    addTransaction({ type: "income", amountMinor: 90_000, transactionTime: "2026-07-12T04:00:00.000Z" });
    addTransaction({ type: "refund", amountMinor: 500, transactionTime: "2026-07-10T06:00:00.000Z" });

    const result = service.overview({ userId: "user-a", month: "2026-07", timeZone: "Asia/Shanghai" });

    expect(result.peakSpendingDay).toBeNull();
  });

  it("provides a lightweight dashboard payload without detailed trend queries", () => {
    addTransaction({ amountMinor: 1_000, transactionTime: "2026-07-10T04:00:00.000Z" });

    const result = service.dashboard({ userId: "user-a", month: "2026-07", timeZone: "Asia/Shanghai" });

    expect(result.summary.grossExpenseMinor).toBe(1_000);
    expect(result.recentTransactions).toHaveLength(1);
    expect("dailyTrend" in result).toBe(false);
    expect("categoryDistribution" in result).toBe(false);
  });

  it("reuses the currency breakdown for the summary and loads the six-month trend in one query", () => {
    addTransaction({
      amountMinor: 1_000,
      transactionTime: "2026-02-10T04:00:00.000Z",
    });
    addTransaction({
      amountMinor: 2_000,
      transactionTime: "2026-07-10T04:00:00.000Z",
    });
    const selectQueries: string[] = [];
    const loggedDatabase = drizzle(database.sqlite, {
      schema: databaseSchema,
      logger: {
        logQuery(query) {
          if (/^\s*(select|with)\b/iu.test(query)) selectQueries.push(query);
        },
      },
    });
    const loggedService = createStatisticsService(loggedDatabase);

    const result = loggedService.overview({
      userId: "user-a",
      month: "2026-07",
      timeZone: "Asia/Shanghai",
    });

    expect(result.monthlyTrend).toHaveLength(6);
    expect(result.monthlyTrend[0]).toMatchObject({
      month: "2026-02",
      grossExpenseMinor: 1_000,
    });
    expect(result.monthlyTrend[5]).toMatchObject({
      month: "2026-07",
      grossExpenseMinor: 2_000,
    });
    expect(
      selectQueries.filter((query) => /case\s+when[\s\S]+transaction_time/iu.test(query)),
    ).toHaveLength(1);
    expect(selectQueries).toHaveLength(7);
  });

  it("rejects year zero instead of letting Date.UTC reinterpret it as 1900", () => {
    expect(() => getMonthRange("0000-07", "Asia/Shanghai")).toThrowError(
      "Month format must be YYYY-MM",
    );
  });

  it("defines month-over-month changes when the previous value is zero", () => {
    expect(calculateMonthChange(0, 0)).toMatchObject({ ratePercent: 0, status: "unchanged" });
    expect(calculateMonthChange(100, 0)).toMatchObject({ ratePercent: null, status: "new" });
    expect(calculateMonthChange(50, 100)).toMatchObject({ ratePercent: -50, status: "down" });
  });
});
