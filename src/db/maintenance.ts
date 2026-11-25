import { eq, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { transactions } from "@/db/schema";
import { createTransactionFingerprint } from "@/lib/fingerprint";
import { normalizeTransactionTime } from "@/lib/transaction-time";

export function repairCanonicalTransactions(database: Database) {
  const state = database.get<{ user_version: number }>(sql`PRAGMA user_version`);
  if ((state?.user_version ?? 0) >= 1) return 0;

  const rows = database
    .select({
      id: transactions.id,
      source: transactions.source,
      type: transactions.type,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      merchantName: transactions.merchantName,
      transactionTime: transactions.transactionTime,
      fingerprint: transactions.fingerprint,
    })
    .from(transactions)
    .all();
  let repairedCount = 0;

  database.transaction((tx) => {
    for (const row of rows) {
      const transactionTime = normalizeTransactionTime(row.transactionTime);
      const fingerprint = createTransactionFingerprint({
        ...row,
        transactionTime,
      });
      if (
        transactionTime === row.transactionTime &&
        fingerprint === row.fingerprint
      ) {
        continue;
      }
      tx.update(transactions)
        .set({ transactionTime, fingerprint })
        .where(eq(transactions.id, row.id))
        .run();
      repairedCount += 1;
    }
  });
  // Drizzle owns this SQLite file and does not otherwise use user_version.
  database.run(sql`PRAGMA user_version = 1`);

  return repairedCount;
}
