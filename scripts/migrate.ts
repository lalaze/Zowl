import "dotenv/config";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { database } from "../src/db/client";
import { repairCanonicalTransactions } from "../src/db/maintenance";

try {
  migrate(database.db, { migrationsFolder: "drizzle" });
  const repairedCount = repairCanonicalTransactions(database.db);
  database.sqlite.close();
  console.log(
    repairedCount
      ? `Database migrations applied; repaired ${repairedCount} legacy transaction(s).`
      : "Database migrations applied.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Migration failed");
  process.exitCode = 1;
}
