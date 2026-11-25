import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { categories, transactions } from "@/db/schema";

import type { AggregateRow } from "./summary";

export type MonthQueryRange = { month: string; start: string; end: string };

export function aggregateRows(
  database: Database,
  userId: string,
  start: string,
  end: string,
  currency: string,
) {
  return database
    .select({
      type: transactions.type,
      totalMinor: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)`,
      transactionCount: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.voidedAt),
        gte(transactions.transactionTime, start),
        lt(transactions.transactionTime, end),
        eq(transactions.currency, currency),
      ),
    )
    .groupBy(transactions.type)
    .all();
}

export function currencyAggregateRows(
  database: Database,
  userId: string,
  start: string,
  end: string,
) {
  return database
    .select({
      currency: transactions.currency,
      type: transactions.type,
      totalMinor: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)`,
      transactionCount: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.voidedAt),
        gte(transactions.transactionTime, start),
        lt(transactions.transactionTime, end),
      ),
    )
    .groupBy(transactions.currency, transactions.type)
    .all();
}

export function listRecentTransactions(database: Database, userId: string) {
  return database
    .select({
      id: transactions.id,
      type: transactions.type,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      merchantName: transactions.merchantName,
      description: transactions.description,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      transactionTime: transactions.transactionTime,
      source: transactions.source,
    })
    .from(transactions)
    .leftJoin(
      categories,
      and(
        eq(transactions.categoryId, categories.id),
        eq(categories.userId, userId),
      ),
    )
    .where(and(eq(transactions.userId, userId), isNull(transactions.voidedAt)))
    .orderBy(desc(transactions.transactionTime), desc(transactions.createdAt))
    .limit(5)
    .all();
}

export function categoryAggregateRows(
  database: Database,
  userId: string,
  currency: string,
  start: string,
  end: string,
) {
  return database
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      amountMinor: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)`,
      transactionCount: sql<number>`count(*)`,
    })
    .from(transactions)
    .leftJoin(
      categories,
      and(
        eq(transactions.categoryId, categories.id),
        eq(categories.userId, userId),
      ),
    )
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.voidedAt),
        eq(transactions.currency, currency),
        eq(transactions.type, "expense"),
        gte(transactions.transactionTime, start),
        lt(transactions.transactionTime, end),
      ),
    )
    .groupBy(
      transactions.categoryId,
      categories.name,
      categories.icon,
      categories.color,
    )
    .orderBy(desc(sql`sum(${transactions.amountMinor})`))
    .all();
}

export function sourceAggregateRows(
  database: Database,
  userId: string,
  currency: string,
  start: string,
  end: string,
) {
  return database
    .select({
      source: transactions.source,
      amountMinor: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)`,
      transactionCount: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.voidedAt),
        eq(transactions.currency, currency),
        eq(transactions.type, "expense"),
        gte(transactions.transactionTime, start),
        lt(transactions.transactionTime, end),
      ),
    )
    .groupBy(transactions.source)
    .orderBy(desc(sql`sum(${transactions.amountMinor})`))
    .all();
}

export function currentMonthTransactionRows(
  database: Database,
  userId: string,
  currency: string,
  start: string,
  end: string,
) {
  return database
    .select({
      id: transactions.id,
      type: transactions.type,
      amountMinor: transactions.amountMinor,
      merchantName: transactions.merchantName,
      transactionTime: transactions.transactionTime,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.voidedAt),
        eq(transactions.currency, currency),
        gte(transactions.transactionTime, start),
        lt(transactions.transactionTime, end),
      ),
    )
    .all();
}

export function trailingMonthAggregateRows(
  database: Database,
  userId: string,
  currency: string,
  ranges: MonthQueryRange[],
) {
  if (!ranges.length) return [];
  const cases = ranges.map(
    (range) =>
      sql`when ${transactions.transactionTime} >= ${range.start} and ${transactions.transactionTime} < ${range.end} then ${range.month}`,
  );
  const monthBucket = sql<string>`case ${sql.join(cases, sql.raw(" "))} end`;
  return database
    .select({
      month: monthBucket,
      type: transactions.type,
      totalMinor: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)`,
      transactionCount: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.voidedAt),
        eq(transactions.currency, currency),
        gte(transactions.transactionTime, ranges[0]!.start),
        lt(transactions.transactionTime, ranges.at(-1)!.end),
      ),
    )
    .groupBy(monthBucket, transactions.type)
    .all() as Array<{ month: string } & AggregateRow>;
}
