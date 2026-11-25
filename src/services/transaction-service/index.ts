import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db, type Database } from "@/db/client";
import {
  categories,
  notificationCaptures,
  transactions,
  users,
} from "@/db/schema";
import { minorToDecimal } from "@/lib/money";
import { publicOrderDetails } from "@/lib/order-details";
import type { TransactionListQuery } from "@/services/transaction-service/schema";

const transactionSelection = {
  id: transactions.id,
  type: transactions.type,
  amountMinor: transactions.amountMinor,
  currency: transactions.currency,
  merchantName: transactions.merchantName,
  description: transactions.description,
  categoryId: transactions.categoryId,
  categoryName: categories.name,
  categoryIcon: categories.icon,
  categoryColor: categories.color,
  transactionTime: transactions.transactionTime,
  createdAt: transactions.createdAt,
  updatedAt: transactions.updatedAt,
  source: transactions.source,
  paymentMethod: transactions.paymentMethod,
  platformTransactionId: transactions.platformTransactionId,
  status: transactions.status,
  originalFileId: transactions.originalFileId,
  importBatchId: transactions.importBatchId,
  duplicateStatus: transactions.duplicateStatus,
  needsReview: transactions.needsReview,
  currentRevisionId: transactions.currentRevisionId,
  revisionNumber: transactions.revisionNumber,
  voidedAt: transactions.voidedAt,
};

function toTransactionDto<T extends { amountMinor: number; currency: string }>(
  row: T,
) {
  return {
    ...row,
    amount: minorToDecimal(row.amountMinor, row.currency),
  };
}

function nextCalendarDate(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function timezoneOffsetMilliseconds(timezone: string, instant: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return (
    Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second,
    ) - instant.getTime()
  );
}

function localDateStartUtc(date: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day);
  let instant = new Date(localAsUtc);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    instant = new Date(
      localAsUtc - timezoneOffsetMilliseconds(timezone, instant),
    );
  }

  return instant.toISOString();
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function buildListConditions(
  userId: string,
  timezone: string,
  query: TransactionListQuery,
) {
  const conditions: SQL[] = [
    eq(transactions.userId, userId),
    isNull(transactions.voidedAt),
  ];

  if (query.dateFrom) {
    conditions.push(
      gte(
        transactions.transactionTime,
        localDateStartUtc(query.dateFrom, timezone),
      ),
    );
  }
  if (query.dateTo) {
    conditions.push(
      lt(
        transactions.transactionTime,
        localDateStartUtc(nextCalendarDate(query.dateTo), timezone),
      ),
    );
  }
  if (query.uncategorized) {
    conditions.push(isNull(transactions.categoryId));
  } else if (query.categoryId) {
    conditions.push(eq(transactions.categoryId, query.categoryId));
  }
  if (query.currency) {
    conditions.push(eq(transactions.currency, query.currency));
  }
  if (query.source) {
    conditions.push(eq(transactions.source, query.source));
  }
  if (query.type) {
    conditions.push(eq(transactions.type, query.type));
  }
  if (query.keyword) {
    const pattern = `%${escapeLikePattern(query.keyword)}%`;
    const keywordCondition = or(
      sql`${transactions.merchantName} LIKE ${pattern} ESCAPE '\\'`,
      sql`${transactions.description} LIKE ${pattern} ESCAPE '\\'`,
    );
    if (keywordCondition) conditions.push(keywordCondition);
  }

  return and(...conditions)!;
}

export function createTransactionService(database: Database = db) {
  /**
   * Adds the goods a shopping-app payment bought, kept on the capture that
   * posted the transaction; null for every other transaction.
   */
  function withOrderDetails<T extends { id: string }>(userId: string, rows: T[]) {
    const captured = rows.length
      ? database
          .select({
            transactionId: notificationCaptures.resultTransactionId,
            orderDetails: notificationCaptures.orderDetails,
          })
          .from(notificationCaptures)
          .where(
            and(
              eq(notificationCaptures.userId, userId),
              inArray(
                notificationCaptures.resultTransactionId,
                rows.map((row) => row.id),
              ),
              isNotNull(notificationCaptures.orderDetails),
            ),
          )
          .all()
      : [];
    const detailsByTransaction = new Map(
      captured.map((capture) => [
        capture.transactionId,
        publicOrderDetails(capture.orderDetails),
      ]),
    );
    return rows.map((row) => ({
      ...row,
      orderDetails: detailsByTransaction.get(row.id) ?? null,
    }));
  }

  function list(userId: string, limit = 100) {
    const rows = database
      .select(transactionSelection)
      .from(transactions)
      .leftJoin(
        categories,
        and(
          eq(transactions.categoryId, categories.id),
          eq(categories.userId, userId),
        ),
      )
      .where(
        and(eq(transactions.userId, userId), isNull(transactions.voidedAt)),
      )
      .orderBy(desc(transactions.transactionTime), desc(transactions.id))
      .limit(Math.min(Math.max(limit, 1), 100))
      .all()
      .map(toTransactionDto);
    return withOrderDetails(userId, rows);
  }

  function listPage(userId: string, query: TransactionListQuery) {
    const timezone =
      database
        .select({ timezone: users.timezone })
        .from(users)
        .where(eq(users.id, userId))
        .get()?.timezone ?? "UTC";
    const where = buildListConditions(userId, timezone, query);
    const total =
      database
        .select({ value: count() })
        .from(transactions)
        .where(where)
        .get()?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    const page = Math.min(query.page, totalPages);
    const offset = (page - 1) * query.limit;
    const aggregateRows = database
      .select({
        currency: transactions.currency,
        type: transactions.type,
        totalMinor: sql<number>`coalesce(sum(${transactions.amountMinor}), 0)`,
      })
      .from(transactions)
      .where(where)
      .groupBy(transactions.currency, transactions.type)
      .all();
    const totalsByCurrency = new Map<
      string,
      {
        currency: string;
        expenseMinor: number;
        refundMinor: number;
        incomeMinor: number;
        transferMinor: number;
      }
    >();
    for (const row of aggregateRows) {
      const entry = totalsByCurrency.get(row.currency) ?? {
        currency: row.currency,
        expenseMinor: 0,
        refundMinor: 0,
        incomeMinor: 0,
        transferMinor: 0,
      };
      const amount = Number(row.totalMinor);
      if (row.type === "expense") entry.expenseMinor += amount;
      else if (row.type === "refund") entry.refundMinor += amount;
      else if (row.type === "income") entry.incomeMinor += amount;
      else if (row.type === "transfer") entry.transferMinor += amount;
      totalsByCurrency.set(row.currency, entry);
    }
    const totals = [...totalsByCurrency.values()].sort((a, b) =>
      a.currency.localeCompare(b.currency),
    );
    const rows = database
      .select(transactionSelection)
      .from(transactions)
      .leftJoin(
        categories,
        and(
          eq(transactions.categoryId, categories.id),
          eq(categories.userId, userId),
        ),
      )
      .where(where)
      .orderBy(desc(transactions.transactionTime), desc(transactions.id))
      .limit(query.limit)
      .offset(offset)
      .all()
      .map(toTransactionDto);
    const items = withOrderDetails(userId, rows);

    return {
      items,
      pagination: {
        page,
        limit: query.limit,
        total,
        totalPages,
      },
      totals,
    };
  }

  function get(userId: string, id: string) {
    const row = database
      .select(transactionSelection)
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
          eq(transactions.id, id),
          eq(transactions.userId, userId),
          isNull(transactions.voidedAt),
        ),
      )
      .get();

    return row ? withOrderDetails(userId, [toTransactionDto(row)])[0]! : null;
  }

  function listCategories(userId: string) {
    return database
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(categories.sortOrder, categories.name)
      .all();
  }

  return {
    list,
    listPage,
    get,
    listCategories,
  };
}

export const transactionService = createTransactionService();
