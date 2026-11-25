import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import BetterSqlite3 from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "@/db/schema";

function prepareDatabasePath(source: string) {
  if (source !== ":memory:" && !source.startsWith("file:")) {
    mkdirSync(dirname(source), { recursive: true });
  }
}

export function createDatabase(
  source = process.env.DATABASE_URL ?? ".data/zemoney.sqlite",
) {
  prepareDatabasePath(source);

  const sqlite = new BetterSqlite3(source);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  if (source !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
  }

  return {
    db: drizzle(sqlite, { schema }),
    sqlite,
  };
}

const globalForDatabase = globalThis as unknown as {
  zeMoneyDatabase?: ReturnType<typeof createDatabase>;
};

export const database =
  globalForDatabase.zeMoneyDatabase ?? createDatabase();

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.zeMoneyDatabase = database;
}

export const db = database.db;
export type Database = typeof db;
