import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, gt, isNull, lte } from "drizzle-orm";

import type { Database } from "@/db/client";
import { sessions, users } from "@/db/schema";
import type { AvatarPreset } from "@/lib/avatar-presets";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "member";
  avatarPreset: AvatarPreset;
  timezone: string;
};

export type IssuedSession = {
  token: string;
  expiresAt: string;
};

type SessionEnvironment = { SESSION_TTL_DAYS?: string };

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionTtlDays(
  env: SessionEnvironment = { SESSION_TTL_DAYS: process.env.SESSION_TTL_DAYS },
) {
  const parsed = Number.parseInt(env.SESSION_TTL_DAYS ?? "30", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 90) : 30;
}

export function createSessionStore(database: Database) {
  function issue(
    userId: string,
    env: SessionEnvironment = {
      SESSION_TTL_DAYS: process.env.SESSION_TTL_DAYS,
    },
  ) {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + sessionTtlDays(env) * 24 * 60 * 60 * 1000,
    ).toISOString();

    database
      .delete(sessions)
      .where(lte(sessions.expiresAt, now.toISOString()))
      .run();

    database
      .insert(sessions)
      .values({
        id: randomUUID(),
        userId,
        tokenHash: hashSessionToken(token),
        expiresAt,
        createdAt: now.toISOString(),
      })
      .run();

    return { token, expiresAt } satisfies IssuedSession;
  }

  function findUser(token: string): SessionUser | null {
    return (
      database
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          avatarPreset: users.avatarPreset,
          timezone: users.timezone,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(
          and(
            eq(sessions.tokenHash, hashSessionToken(token)),
            gt(sessions.expiresAt, new Date().toISOString()),
            isNull(users.disabledAt),
          ),
        )
        .get() ?? null
    );
  }

  function revoke(token: string) {
    return database
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashSessionToken(token)))
      .run().changes > 0;
  }

  function revokeUser(userId: string) {
    return database.delete(sessions).where(eq(sessions.userId, userId)).run()
      .changes;
  }

  return { issue, findUser, revoke, revokeUser };
}
