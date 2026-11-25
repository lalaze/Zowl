import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { createAuthService } from "@/services/auth-service";
import { LoginAttemptLimiter } from "@/services/auth-service/login-attempt-limiter";

describe("auth service", () => {
  let database: ReturnType<typeof createDatabase>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    const now = "2026-07-24T00:00:00.000Z";
    database.db
      .insert(users)
      .values({
        id: "mobile-user",
        email: "mobile@example.com",
        passwordHash: await hashPassword("correct-password"),
        displayName: "Mobile user",
        avatarPreset: "cat",
        timezone: "Asia/Shanghai",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => database.sqlite.close());

  it("returns a session-safe user only when the credentials match", async () => {
    const service = createAuthService(database.db);

    await expect(
      service.authenticate({
        email: "mobile@example.com",
        password: "correct-password",
      }),
    ).resolves.toEqual({
      id: "mobile-user",
      email: "mobile@example.com",
      displayName: "Mobile user",
      role: "member",
      avatarPreset: "cat",
      timezone: "Asia/Shanghai",
    });
    await expect(
      service.authenticate({
        email: "mobile@example.com",
        password: "wrong-password",
      }),
    ).resolves.toBeNull();
  });

  it("runs the same password verification work for an unknown email", async () => {
    const hashes: string[] = [];
    const service = createAuthService(database.db, {
      passwordVerifier: async (_password, storedHash) => {
        hashes.push(storedHash);
        return false;
      },
    });

    await expect(
      service.authenticate({
        email: "missing@example.com",
        password: "wrong-password",
      }),
    ).resolves.toBeNull();
    expect(hashes).toHaveLength(1);
    expect(hashes[0]).toMatch(/^scrypt\$/u);
  });

  it("shares account failures across both login entry points", async () => {
    const limiter = new LoginAttemptLimiter();
    const webLogin = createAuthService(database.db, { limiter });
    const bearerLogin = createAuthService(database.db, { limiter });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const service = attempt % 2 === 0 ? webLogin : bearerLogin;
      await expect(
        service.authenticateLogin({
          email: "mobile@example.com",
          password: "wrong-password",
        }),
      ).resolves.toEqual({ status: "invalid" });
    }

    await expect(
      bearerLogin.authenticateLogin({
        email: "mobile@example.com",
        password: "correct-password",
      }),
    ).resolves.toMatchObject({
      status: "rate_limited",
      retryAfterSeconds: 900,
    });
  });

  it("distinguishes an uninitialized system and a correctly authenticated disabled account", async () => {
    database.db.delete(users).run();
    const emptyService = createAuthService(database.db, {
      limiter: new LoginAttemptLimiter(),
    });
    await expect(
      emptyService.authenticateLogin({
        email: "missing@example.com",
        password: "some-password",
      }),
    ).resolves.toEqual({ status: "not_initialized" });

    const now = "2026-07-24T00:00:00.000Z";
    database.db
      .insert(users)
      .values({
        id: "disabled-user",
        email: "disabled@example.com",
        passwordHash: await hashPassword("correct-password"),
        displayName: "Disabled user",
        disabledAt: now,
        timezone: "Asia/Shanghai",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const disabledService = createAuthService(database.db, {
      limiter: new LoginAttemptLimiter(),
    });
    await expect(
      disabledService.authenticateLogin({
        email: "disabled@example.com",
        password: "correct-password",
      }),
    ).resolves.toEqual({ status: "disabled" });
    await expect(
      disabledService.authenticateLogin({
        email: "disabled@example.com",
        password: "wrong-password",
      }),
    ).resolves.toEqual({ status: "invalid" });
  });
});
