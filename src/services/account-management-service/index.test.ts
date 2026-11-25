import path from "node:path";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { categories, sessions, users } from "@/db/schema";
import { createSessionStore } from "@/lib/auth/session-store";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  AccountManagementError,
  createAccountManagementService,
} from "@/services/account-management-service";
import { createAuthService } from "@/services/auth-service";
import { LoginAttemptLimiter } from "@/services/auth-service/login-attempt-limiter";

describe("account management service", () => {
  let database: ReturnType<typeof createDatabase>;
  const now = "2026-07-29T00:00:00.000Z";

  beforeEach(async () => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    database.db
      .insert(users)
      .values([
        {
          id: "admin-user",
          email: "admin@example.com",
          passwordHash: await hashPassword("admin-current-password"),
          displayName: "Administrator",
          role: "admin",
          timezone: "Asia/Shanghai",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "member-user",
          email: "member@example.com",
          passwordHash: await hashPassword("member-current-password"),
          displayName: "Regular user",
          role: "member",
          timezone: "Asia/Shanghai",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
  });

  afterEach(() => database.sqlite.close());

  it("lets only the administrator list and create isolated member accounts", async () => {
    const service = createAccountManagementService(database.db);
    expect(service.list("admin-user", { page: 1, limit: 20 }).items).toHaveLength(
      2,
    );
    expect(() =>
      service.list("member-user", { page: 1, limit: 20 }),
    ).toThrowError(
      expect.objectContaining({
        code: "ADMIN_REQUIRED",
      }) as AccountManagementError,
    );

    const created = await service.createMember("admin-user", {
      email: "new@example.com",
      displayName: "New user",
      password: "new-member-password",
    });
    expect(created).toMatchObject({
      email: "new@example.com",
      role: "member",
      disabled: false,
    });
    expect(
      database.db
        .select()
        .from(categories)
        .where(eq(categories.userId, created.id))
        .all(),
    ).toHaveLength(14);

    const chinese = await service.createMember(
      "admin-user",
      { email: "zh@example.com", password: "new-member-password" },
      "zh",
    );
    expect(
      database.db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.userId, chinese.id))
        .all(),
    ).toContainEqual({ id: `${chinese.id}:category:transfer`, name: "转账" });
  });

  it("requires administrator reauthentication and revokes every target session after reset", async () => {
    const service = createAccountManagementService(database.db);
    const store = createSessionStore(database.db);
    store.issue("member-user");
    store.issue("member-user");

    await expect(
      service.resetPassword("admin-user", "member-user", {
        adminPassword: "wrong-password",
        newPassword: "new-member-password",
      }),
    ).rejects.toMatchObject({ code: "ADMIN_PASSWORD_INVALID" });
    expect(database.db.select().from(sessions).all()).toHaveLength(2);

    await expect(
      service.resetPassword("admin-user", "member-user", {
        adminPassword: "admin-current-password",
        newPassword: "new-member-password",
      }),
    ).resolves.toEqual({ requiresReauthentication: false });
    expect(database.db.select().from(sessions).all()).toHaveLength(0);
    const member = database.db
      .select()
      .from(users)
      .where(eq(users.id, "member-user"))
      .get()!;
    await expect(
      verifyPassword("new-member-password", member.passwordHash),
    ).resolves.toBe(true);
  });

  it("invalidates a disabled member immediately and keeps the sole administrator active", async () => {
    const service = createAccountManagementService(database.db);
    const store = createSessionStore(database.db);
    const memberSession = store.issue("member-user");

    expect(service.setDisabled("admin-user", "member-user", true)).toMatchObject(
      { id: "member-user", disabled: true },
    );
    expect(store.findUser(memberSession.token)).toBeNull();
    await expect(
      createAuthService(database.db, {
        limiter: new LoginAttemptLimiter(),
      }).authenticateLogin({
        email: "member@example.com",
        password: "member-current-password",
      }),
    ).resolves.toEqual({ status: "disabled" });

    expect(service.setDisabled("admin-user", "member-user", false)).toMatchObject(
      { disabled: false },
    );
    expect(() =>
      service.setDisabled("admin-user", "admin-user", true),
    ).toThrowError(
      expect.objectContaining({
        code: "ADMIN_STATUS_IMMUTABLE",
      }) as AccountManagementError,
    );
  });
});
