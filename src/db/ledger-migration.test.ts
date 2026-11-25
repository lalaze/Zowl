import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { postingConfirmations, transactionRevisions } from "@/db/schema";
import { createLedgerTransactionService } from "@/services/ledger-transaction";

describe("Ledger Transaction migration", () => {
  const database = createDatabase(":memory:");

  afterEach(() => database.sqlite.close());

  function applyMigration(fileName: string) {
    const sql = readFileSync(
      path.resolve(process.cwd(), "drizzle", fileName),
      "utf8",
    ).replaceAll("--> statement-breakpoint", "");
    database.sqlite.exec(sql);
  }

  it("backfills an honest Legacy Snapshot without fabricating confirmation history", () => {
    [
      "0000_silent_gideon.sql",
      "0001_free_the_watchers.sql",
      "0002_natural_rafael_vega.sql",
      "0003_flat_korath.sql",
    ].forEach(applyMigration);
    database.sqlite
      .prepare(
        `
          INSERT INTO users (
            id, email, password_hash, display_name, timezone, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        "legacy-user",
        "legacy@example.com",
        "test",
        "Legacy",
        "Asia/Shanghai",
        "2026-07-01T00:00:00.000Z",
        "2026-07-01T00:00:00.000Z",
      );
    database.sqlite
      .prepare(
        `
          INSERT INTO transactions (
            id, user_id, type, amount_minor, currency, merchant_name,
            description, category_id, transaction_time, created_at, updated_at,
            source, payment_method, platform_transaction_id, fingerprint,
            duplicate_status, needs_review
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        "legacy-transaction",
        "legacy-user",
        "expense",
        3580,
        "CNY",
        "Mountain Cafe",
        "Historical latte",
        null,
        "2026-07-01T04:30:00.000Z",
        "2026-07-01T04:31:00.000Z",
        "2026-07-01T04:31:00.000Z",
        "alipay",
        "Alipay balance",
        "legacy-platform-id",
        "legacy-fingerprint",
        "unique",
        0,
      );

    applyMigration("0004_calm_quicksilver.sql");
    applyMigration("0005_slimy_stone_men.sql");

    const transaction = database.sqlite
      .prepare(
        `
          SELECT current_revision_id, revision_number
          FROM transactions
          WHERE id = ?
        `,
      )
      .get("legacy-transaction") as {
      current_revision_id: string;
      revision_number: number;
    };
    expect(transaction).toEqual({
      current_revision_id: "legacy:legacy-transaction",
      revision_number: 1,
    });
    expect(database.db.select().from(postingConfirmations).all()).toEqual([]);
    expect(database.db.select().from(transactionRevisions).all()).toEqual([
      expect.objectContaining({
        id: "legacy:legacy-transaction",
        transactionId: "legacy-transaction",
        revisionNumber: 1,
        kind: "legacy_snapshot",
        actorUserId: null,
        confirmationRowId: null,
        provenanceSnapshot: {
          kind: "legacy",
          source: "alipay",
          originalFileId: null,
          importBatchId: null,
        },
      }),
    ]);

    const amended = createLedgerTransactionService(database.db).amendTransaction(
      "legacy-user",
      {
        transactionId: "legacy-transaction",
        expectedRevisionId: "legacy:legacy-transaction",
        operationId: "legacy-amendment",
        facts: {
          type: "expense",
          amountMinor: 3580,
          currency: "CNY",
          merchantName: "Mountain Cafe",
          description: "Amended historical latte",
          categoryId: null,
          transactionTime: "2026-07-01T04:30:00.000Z",
          paymentMethod: "Alipay balance",
        },
        learnCategoryRule: false,
      },
    );
    expect(amended).toMatchObject({
      status: "completed",
      transactionId: "legacy-transaction",
      revisionNumber: 2,
    });
  });
});
