import path from "node:path";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { sessions, users } from "@/db/schema";
import {
  createSessionStore,
  hashSessionToken,
  sessionTtlDays,
} from "@/lib/auth/session-store";

describe("session store", () => {
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    const now = "2026-07-18T00:00:00.000Z";
    database.db
      .insert(users)
      .values({
        id: "mobile-user",
        email: "mobile@example.com",
        passwordHash: "test",
        displayName: "Mobile user",
        timezone: "Asia/Shanghai",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => database.sqlite.close());

  it("issues only an opaque token while storing its hash", () => {
    const store = createSessionStore(database.db);
    const issued = store.issue("mobile-user", { SESSION_TTL_DAYS: "30" });
    const row = database.db.select().from(sessions).get();

    expect(issued.token).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(row?.tokenHash).toBe(hashSessionToken(issued.token));
    expect(row?.tokenHash).not.toContain(issued.token);
    expect(store.findUser(issued.token)).toMatchObject({
      id: "mobile-user",
      email: "mobile@example.com",
    });
  });

  it("revokes one device session without touching other sessions", () => {
    const store = createSessionStore(database.db);
    const first = store.issue("mobile-user");
    const second = store.issue("mobile-user");

    expect(store.revoke(first.token)).toBe(true);
    expect(store.findUser(first.token)).toBeNull();
    expect(store.findUser(second.token)?.id).toBe("mobile-user");
  });

  it("rejects expired tokens and clamps the configured TTL", () => {
    const store = createSessionStore(database.db);
    const issued = store.issue("mobile-user");
    database.db
      .update(sessions)
      .set({ expiresAt: "2000-01-01T00:00:00.000Z" })
      .where(eq(sessions.tokenHash, hashSessionToken(issued.token)))
      .run();

    expect(store.findUser(issued.token)).toBeNull();
    expect(sessionTtlDays({ SESSION_TTL_DAYS: "0" })).toBe(1);
    expect(sessionTtlDays({ SESSION_TTL_DAYS: "900" })).toBe(90);
    expect(sessionTtlDays({ SESSION_TTL_DAYS: "invalid" })).toBe(30);
  });

  it("removes expired sessions before issuing a new session", () => {
    const store = createSessionStore(database.db);
    const expired = store.issue("mobile-user");
    database.db
      .update(sessions)
      .set({ expiresAt: "2000-01-01T00:00:00.000Z" })
      .where(eq(sessions.tokenHash, hashSessionToken(expired.token)))
      .run();
    const active = store.issue("mobile-user");

    expect(store.findUser(active.token)?.id).toBe("mobile-user");
    expect(
      database.db
        .select()
        .from(sessions)
        .where(eq(sessions.tokenHash, hashSessionToken(expired.token)))
        .get(),
    ).toBeUndefined();
  });
});
