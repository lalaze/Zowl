import path from "node:path";

import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import {
  categories,
  transactions,
  users,
} from "@/db/schema";
import { createManualPostingAdapter } from "@/services/ledger-transaction/manual-adapter";
import { createTransactionService } from "@/services/transaction-service";
import {
  transactionInputSchema,
  transactionListQuerySchema,
  type TransactionInput,
} from "@/services/transaction-service/schema";

describe("transaction service", () => {
  let database: ReturnType<typeof createDatabase>;
  let service: ReturnType<typeof createTransactionService>;
  let sequence = 0;

  function createFor(
    userId: string,
    overrides: Partial<TransactionInput> = {},
  ) {
    sequence += 1;
    const input: TransactionInput = {
      type: "expense",
      amount: "10.00",
      currency: "CNY",
      merchantName: `Test merchant ${sequence}`,
      description: null,
      categoryId: null,
      transactionTime: "2026-07-15T04:30:00.000Z",
      paymentMethod: null,
      ...overrides,
    };
    const outcome = createManualPostingAdapter(database.db).confirm(userId, {
      ...input,
      confirmation: {
        id: `transaction-reader-test-${sequence}`,
        version: 1,
      },
    });
    if (outcome.status !== "completed") {
      throw new Error("expected manual posting to complete");
    }
    return outcome.transaction;
  }

  beforeEach(() => {
    sequence = 0;
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    const now = "2026-07-15T00:00:00.000Z";

    database.db
      .insert(users)
      .values([
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
      ])
      .run();
    database.db
      .insert(categories)
      .values([
        {
          id: "food-a",
          userId: "user-a",
          name: "Food",
          kind: "expense",
          isSystem: true,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "food-b",
          userId: "user-b",
          name: "Food",
          kind: "expense",
          isSystem: true,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "salary-a",
          userId: "user-a",
          name: "Salary",
          kind: "income",
          isSystem: true,
          sortOrder: 1,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    service = createTransactionService(database.db);
  });

  afterEach(() => database.sqlite.close());

  it("creates integer-money transactions and isolates list/get by user", () => {
    const created = createFor("user-a", {
      type: "expense",
      amount: "35.80",
      currency: "CNY",
      merchantName: "Mountain Cafe",
      description: "Latte",
      categoryId: "food-a",
      transactionTime: "2026-07-15T04:30:00.000Z",
      paymentMethod: "Alipay balance",
    });

    expect(created.amountMinor).toBe(3580);
    expect(created.amount).toBe("35.80");
    expect(service.list("user-a")).toHaveLength(1);
    expect(service.list("user-b")).toHaveLength(0);
    expect(service.get("user-b", created.id)).toBeNull();
  });

  it("normalizes offset instants before UTC filtering and ordering", () => {
    database.db
      .update(users)
      .set({ timezone: "UTC" })
      .where(eq(users.id, "user-a"))
      .run();
    const created = createFor("user-a", {
      merchantName: "UTC Month boundary",
      transactionTime: "2026-07-01T00:30:00+08:00",
    });

    expect(created.transactionTime).toBe("2026-06-30T16:30:00.000Z");
    expect(
      service.listPage(
        "user-a",
        transactionListQuerySchema.parse({
          dateFrom: "2026-07-01",
          dateTo: "2026-07-31",
        }),
      ).items,
    ).toHaveLength(0);
  });

  it("combines date, category, source, type, and keyword filters", () => {
    const target = createFor("user-a", {
      merchantName: "Mountain Cafe",
      description: "Weekday latte",
      categoryId: "food-a",
      transactionTime: "2026-07-15T04:30:00.000Z",
    });
    database.db
      .update(transactions)
      .set({ source: "alipay" })
      .where(eq(transactions.id, target.id))
      .run();
    const wrongType = createFor("user-a", {
      type: "income",
      merchantName: "Mountain Cafe",
      categoryId: "salary-a",
    });
    const wrongDate = createFor("user-a", {
      merchantName: "Mountain Cafe",
      categoryId: "food-a",
      transactionTime: "2026-07-14T15:59:59.999Z",
    });
    const wrongKeyword = createFor("user-a", {
      merchantName: "Another shop",
      categoryId: "food-a",
    });
    const wrongCategory = createFor("user-a", {
      merchantName: "Mountain Cafe",
    });
    database.db
      .update(transactions)
      .set({ source: "alipay" })
      .where(
        inArray(transactions.id, [
          wrongType.id,
          wrongDate.id,
          wrongKeyword.id,
          wrongCategory.id,
        ]),
      )
      .run();

    const result = service.listPage(
      "user-a",
      transactionListQuerySchema.parse({
        dateFrom: "2026-07-15",
        dateTo: "2026-07-15",
        categoryId: "food-a",
        source: "alipay",
        type: "expense",
        keyword: "Cafe",
      }),
    );

    expect(result.items.map((item) => item.id)).toEqual([target.id]);
    expect(result.pagination.total).toBe(1);
  });

  it("keeps filtered results isolated by user", () => {
    const own = createFor("user-a", { merchantName: "Shared merchant" });
    createFor("user-b", { merchantName: "Shared merchant" });

    const result = service.listPage(
      "user-a",
      transactionListQuerySchema.parse({ keyword: "Shared merchant" }),
    );

    expect(result.items.map((item) => item.id)).toEqual([own.id]);
    expect(result.pagination.total).toBe(1);
  });

  it("treats date bounds as inclusive calendar dates in the user timezone", () => {
    createFor("user-a", {
      merchantName: "before",
      transactionTime: "2026-07-14T15:59:59.999Z",
    });
    const start = createFor("user-a", {
      merchantName: "start",
      transactionTime: "2026-07-14T16:00:00.000Z",
    });
    const end = createFor("user-a", {
      merchantName: "end",
      transactionTime: "2026-07-15T15:59:59.999Z",
    });
    createFor("user-a", {
      merchantName: "after",
      transactionTime: "2026-07-15T16:00:00.000Z",
    });

    const result = service.listPage(
      "user-a",
      transactionListQuerySchema.parse({
        dateFrom: "2026-07-15",
        dateTo: "2026-07-15",
      }),
    );

    expect(result.items.map((item) => item.id)).toEqual([end.id, start.id]);
  });

  it("escapes percent and underscore in keyword searches", () => {
    const literal = createFor("user-a", {
      merchantName: "Discount 100%_Special event",
    });
    const descriptionLiteral = createFor("user-a", {
      merchantName: "Invoice merchant",
      description: "Event 100%_Special event",
    });
    createFor("user-a", { merchantName: "Discount 100XA Special event" });
    createFor("user-a", { description: "Discount 100%X Special event" });

    const result = service.listPage(
      "user-a",
      transactionListQuerySchema.parse({ keyword: "100%_" }),
    );

    expect(new Set(result.items.map((item) => item.id))).toEqual(
      new Set([literal.id, descriptionLiteral.id]),
    );
  });

  it("paginates a stable order without duplicates or omissions", () => {
    for (let index = 0; index < 45; index += 1) {
      createFor("user-a", {
        merchantName: `Paged transaction ${index}`,
        transactionTime: "2026-07-15T04:30:00.000Z",
      });
    }

    const ids: string[] = [];
    for (let page = 1; page <= 7; page += 1) {
      const result = service.listPage(
        "user-a",
        transactionListQuerySchema.parse({ page, limit: 7 }),
      );
      ids.push(...result.items.map((item) => item.id));
    }

    expect(ids).toHaveLength(45);
    expect(new Set(ids).size).toBe(45);
    expect(ids).toEqual(service.list("user-a", 100).map((item) => item.id));

    const beyondLastPage = service.listPage(
      "user-a",
      transactionListQuerySchema.parse({ page: 999, limit: 7 }),
    );
    expect(beyondLastPage.pagination.page).toBe(7);
    expect(beyondLastPage.items).toHaveLength(3);
  });

  it("validates list filters and pagination limits", () => {
    expect(
      transactionListQuerySchema.safeParse({
        dateFrom: "2026-07-16",
        dateTo: "2026-07-15",
      }).success,
    ).toBe(false);
    expect(
      transactionListQuerySchema.safeParse({ limit: 101 }).success,
    ).toBe(false);
    expect(
      transactionListQuerySchema.safeParse({ keyword: "x".repeat(101) })
        .success,
    ).toBe(false);
    expect(
      transactionListQuerySchema.safeParse({ source: "unknown" }).success,
    ).toBe(false);
    expect(
      transactionListQuerySchema.safeParse({
        uncategorized: "true",
        categoryId: "food-a",
      }).success,
    ).toBe(false);
    expect(
      transactionListQuerySchema.safeParse({ currency: "usd" }).data?.currency,
    ).toBe("USD");
    expect(
      transactionListQuerySchema.safeParse({ currency: "US" }).success,
    ).toBe(false);
    expect(
      transactionInputSchema.safeParse({
        type: "expense",
        amount: "100",
        currency: "JPY",
        merchantName: null,
        description: null,
        categoryId: null,
        transactionTime: "2026-07-15T04:30:00.000Z",
        paymentMethod: null,
      }).success,
    ).toBe(false);
  });

  it("filters uncategorized and currency and returns full-query totals across pages", () => {
    createFor("user-a", {
      amount: "10.00",
      currency: "CNY",
      categoryId: "food-a",
    });
    const u1 = createFor("user-a", {
      amount: "12.50",
      currency: "CNY",
      categoryId: null,
    });
    const u2 = createFor("user-a", {
      amount: "7.50",
      currency: "CNY",
      categoryId: null,
    });
    const u3 = createFor("user-a", {
      amount: "5.00",
      currency: "CNY",
      categoryId: null,
    });
    const usd = createFor("user-a", {
      amount: "20.00",
      currency: "USD",
      categoryId: null,
    });

    const uncategorizedCny = service.listPage(
      "user-a",
      transactionListQuerySchema.parse({
        uncategorized: "true",
        currency: "CNY",
        limit: 2,
      }),
    );
    expect(uncategorizedCny.items).toHaveLength(2);
    expect(uncategorizedCny.pagination.total).toBe(3);
    expect(uncategorizedCny.totals).toEqual([
      {
        currency: "CNY",
        expenseMinor: 2500,
        refundMinor: 0,
        incomeMinor: 0,
        transferMinor: 0,
      },
    ]);
    expect(
      uncategorizedCny.items.every((item) =>
        [u1.id, u2.id, u3.id].includes(item.id),
      ),
    ).toBe(true);

    const usdOnly = service.listPage(
      "user-a",
      transactionListQuerySchema.parse({ currency: "USD" }),
    );
    expect(usdOnly.items.map((item) => item.id)).toEqual([usd.id]);
    expect(usdOnly.totals).toEqual([
      {
        currency: "USD",
        expenseMinor: 2000,
        refundMinor: 0,
        incomeMinor: 0,
        transferMinor: 0,
      },
    ]);
  });
});
