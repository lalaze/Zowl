import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { categories, transactionRevisions, users } from "@/db/schema";
import { createManualPostingAdapter } from "@/services/ledger-transaction/manual-adapter";

describe("manual Ledger Posting adapter", () => {
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    const now = "2026-07-16T00:00:00.000Z";
    database.db
      .insert(users)
      .values({
        id: "user-a",
        email: "a@example.com",
        passwordHash: "test",
        displayName: "A",
        timezone: "Asia/Shanghai",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(categories)
      .values({
        id: "food-a",
        userId: "user-a",
        name: "Food",
        kind: "expense",
        isSystem: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => database.sqlite.close());

  it("converts the form amount into a canonical manual candidate and returns the posted Transaction", () => {
    const adapter = createManualPostingAdapter(database.db);

    const result = adapter.confirm("user-a", {
      confirmation: { id: "manual-form-1", version: 1 },
      type: "expense",
      amount: "35.80",
      currency: "cny",
      merchantName: "Mountain Cafe",
      description: "Latte",
      categoryId: "food-a",
      transactionTime: "2026-07-16T04:30:00.000Z",
      paymentMethod: "Alipay balance",
    });

    expect(result).toMatchObject({
      status: "completed",
      confirmationId: "manual-form-1",
      transaction: {
        amountMinor: 3580,
        amount: "35.80",
        source: "manual",
      },
    });
    expect(database.db.select().from(transactionRevisions).all()).toHaveLength(
      1,
    );
  });
});
