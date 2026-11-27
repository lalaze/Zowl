import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { users } from "@/db/schema";

it("upgrades the existing production migration history without changing account settings or screenshot columns", () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), "zowl-migration-test-"));
  const database = createDatabase(":memory:");
  try {
    const migrations = path.resolve("drizzle");
    const journal = JSON.parse(readFileSync(path.join(migrations, "meta/_journal.json"), "utf8"));
    const paymentPages = journal.entries.findIndex((entry: { tag: string }) => entry.tag === "0019_payment-page-capture");
    const previous = { ...journal, entries: journal.entries.slice(0, paymentPages) };
    expect(previous.entries.at(-1).tag).toBe("0018_screenshot_submissions");
    mkdirSync(path.join(folder, "meta"));
    writeFileSync(path.join(folder, "meta/_journal.json"), JSON.stringify(previous));
    for (const entry of previous.entries) {
      copyFileSync(path.join(migrations, `${entry.tag}.sql`), path.join(folder, `${entry.tag}.sql`));
    }
    migrate(database.db, { migrationsFolder: folder });
    const now = "2026-11-05T00:00:00.000Z";
    database.db.insert(users).values({
      id: "upgrade-user", email: "upgrade@example.com", passwordHash: "test",
      displayName: "Upgrade", createdAt: now, updatedAt: now,
    }).run();
    database.sqlite.prepare(`INSERT INTO notification_capture_settings
      (user_id, auto_post_alipay, auto_post_wechat, auto_post_cmb, auto_post_max_amount_minor, created_at, updated_at)
      VALUES (?, 1, 0, 1, 12345, ?, ?)`).run("upgrade-user", now, now);
    const before = database.sqlite.prepare("SELECT * FROM notification_capture_settings").get();
    migrate(database.db, { migrationsFolder: migrations });
    migrate(database.db, { migrationsFolder: migrations });
    expect(database.sqlite.prepare("SELECT * FROM notification_capture_settings").get()).toEqual({
      ...before as object, auto_post_payment_pages: 0, auto_post_trusted_max_amount_minor: 500000,
    });
    const columns = database.sqlite.pragma("table_info(recognition_jobs)") as Array<{ name: string }>;
    expect(columns.map(column => column.name)).toEqual(expect.arrayContaining(["submission_id", "submission_digest"]));
    const captureColumns = database.sqlite.pragma("table_info(notification_captures)") as Array<{ name: string }>;
    expect(captureColumns.map(column => column.name)).toContain("order_details");
    expect(database.sqlite.pragma("foreign_key_check")).toEqual([]);
    expect(database.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
  } finally {
    database.sqlite.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
