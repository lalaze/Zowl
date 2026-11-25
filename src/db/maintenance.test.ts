import path from "node:path";
import { readFileSync } from "node:fs";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { repairCanonicalTransactions } from "@/db/maintenance";
import { transactions, users } from "@/db/schema";
import { createTransactionFingerprint } from "@/lib/fingerprint";

describe("database maintenance", () => {
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    const now = "2026-07-15T00:00:00.000Z";
    database.db
      .insert(users)
      .values({
        id: "maintenance-user",
        email: "maintenance@example.com",
        passwordHash: "test",
        displayName: "Maintenance",
        timezone: "UTC",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(transactions)
      .values({
        id: "legacy-offset-row",
        userId: "maintenance-user",
        type: "expense",
        amountMinor: 1_000,
        currency: "CNY",
        merchantName: "Legacy time-zone transaction",
        transactionTime: "2026-07-01T00:30:00+08:00",
        createdAt: now,
        updatedAt: now,
        source: "manual",
        fingerprint: "legacy-noncanonical-fingerprint",
      })
      .run();
  });

  afterEach(() => database.sqlite.close());

  it("repairs legacy offset times and their dependent fingerprints", () => {
    const migrationSql = readFileSync(
      path.resolve(process.cwd(), "drizzle/0003_flat_korath.sql"),
      "utf8",
    ).split("--> statement-breakpoint")[0]!;
    database.sqlite.exec(migrationSql);
    expect(
      database.db.select().from(transactions).get()?.transactionTime,
    ).toBe("2026-06-30T16:30:00.000Z");

    expect(repairCanonicalTransactions(database.db)).toBe(1);
    const repaired = database.db.select().from(transactions).get()!;

    expect(repaired.transactionTime).toBe("2026-06-30T16:30:00.000Z");
    expect(repaired.fingerprint).toBe(
      createTransactionFingerprint({
        source: repaired.source,
        type: repaired.type,
        amountMinor: repaired.amountMinor,
        currency: repaired.currency,
        merchantName: repaired.merchantName,
        transactionTime: repaired.transactionTime,
      }),
    );
    expect(repairCanonicalTransactions(database.db)).toBe(0);
  });
});
