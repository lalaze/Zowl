import { readFileSync } from "node:fs";
import path from "node:path";

import BetterSqlite3 from "better-sqlite3";
import { describe, expect, it } from "vitest";

describe("user role migration", () => {
  it("promotes only the earliest legacy account to administrator", () => {
    const sqlite = new BetterSqlite3(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE users (
          id text PRIMARY KEY NOT NULL,
          created_at text NOT NULL
        );
        INSERT INTO users (id, created_at) VALUES
          ('later-user', '2026-07-02T00:00:00.000Z'),
          ('first-user', '2026-07-01T00:00:00.000Z');
      `);
      const migration = readFileSync(
        path.resolve("drizzle/0010_lonely_screwball.sql"),
        "utf8",
      );
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) sqlite.exec(statement);
      }

      expect(
        sqlite
          .prepare("SELECT id, role, disabled_at FROM users ORDER BY id")
          .all(),
      ).toEqual([
        { id: "first-user", role: "admin", disabled_at: null },
        { id: "later-user", role: "member", disabled_at: null },
      ]);
    } finally {
      sqlite.close();
    }
  });
});
