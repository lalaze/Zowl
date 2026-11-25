import { randomUUID } from "node:crypto";

import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";

import { db, type Database } from "@/db/client";
import { categories, sessions, users } from "@/db/schema";
import { defaultAvatarPreset } from "@/lib/avatar-presets";
import { defaultCategoryRows } from "@/lib/default-categories";
import { defaultLocale, type Locale } from "@/lib/i18n/locale";
import { hashPassword, verifyPassword } from "@/lib/password";
import { loginAttemptLimiter } from "@/services/auth-service/login-attempt-limiter";

const paginationValue = (defaultValue: number, maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.coerce.number().int().min(1).max(maximum).default(defaultValue),
  );

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a nickname")
  .max(40, "Nickname must not exceed 40 characters")
  .optional();

const passwordSchema = z
  .string()
  .min(12, "Password must contain at least 12 characters")
  .max(200, "Password must not exceed 200 characters");

export const accountListQuerySchema = z.object({
  page: paginationValue(1, 100_000),
  limit: paginationValue(20, 50),
});

export const accountCreateInputSchema = z.object({
  email: z.email("Enter a valid email address").transform((value) => value.toLowerCase()),
  displayName: displayNameSchema,
  password: passwordSchema,
});

export const accountPasswordResetInputSchema = z.object({
  adminPassword: z.string().min(1, "Enter the current administrator password").max(200),
  newPassword: passwordSchema,
});

export const accountStatusInputSchema = z.object({
  disabled: z.boolean(),
});

export type AccountListQuery = z.infer<typeof accountListQuerySchema>;
export type AccountCreateInput = z.infer<typeof accountCreateInputSchema>;
export type AccountPasswordResetInput = z.infer<
  typeof accountPasswordResetInputSchema
>;

export class AccountManagementError extends Error {
  constructor(
    readonly status: number,
    readonly code:
      | "ACCOUNT_NOT_FOUND"
      | "EMAIL_ALREADY_EXISTS"
      | "ADMIN_REQUIRED"
      | "ADMIN_PASSWORD_INVALID"
      | "ADMIN_REAUTH_RATE_LIMITED"
      | "ADMIN_STATUS_IMMUTABLE",
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AccountManagementError";
  }
}

function accountDto(account: typeof users.$inferSelect) {
  return {
    id: account.id,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    disabled: account.disabledAt !== null,
    createdAt: account.createdAt,
  };
}

export function createAccountManagementService(database: Database = db) {
  function requireAdmin(actorUserId: string) {
    const actor = database
      .select()
      .from(users)
      .where(eq(users.id, actorUserId))
      .get();
    if (!actor || actor.role !== "admin" || actor.disabledAt) {
      throw new AccountManagementError(
        403,
        "ADMIN_REQUIRED",
        "Only administrators can manage accounts",
      );
    }
    return actor;
  }

  function list(actorUserId: string, query: AccountListQuery) {
    requireAdmin(actorUserId);
    const total =
      database.select({ value: count() }).from(users).get()?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    const page = Math.min(query.page, totalPages);
    const items = database
      .select()
      .from(users)
      .orderBy(asc(users.role), asc(users.createdAt), asc(users.id))
      .limit(query.limit)
      .offset((page - 1) * query.limit)
      .all()
      .map(accountDto);

    return {
      items,
      pagination: { page, limit: query.limit, total, totalPages },
    };
  }

  /** `locale` names the new account's built-in categories (the admin's UI language). */
  async function createMember(
    actorUserId: string,
    input: AccountCreateInput,
    locale: Locale = defaultLocale,
  ) {
    requireAdmin(actorUserId);
    if (
      database
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .get()
    ) {
      throw new AccountManagementError(
        409,
        "EMAIL_ALREADY_EXISTS",
        "This email is already in use",
      );
    }

    const userId = randomUUID();
    const timestamp = new Date().toISOString();
    const passwordHash = await hashPassword(input.password);

    database.transaction((transaction) => {
      if (
        transaction
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.email))
          .get()
      ) {
        throw new AccountManagementError(
          409,
          "EMAIL_ALREADY_EXISTS",
          "This email is already in use",
        );
      }

      transaction
        .insert(users)
        .values({
          id: userId,
          email: input.email,
          passwordHash,
          displayName:
            input.displayName ?? input.email.slice(0, input.email.indexOf("@")),
          role: "member",
          avatarPreset: defaultAvatarPreset,
          timezone: "Asia/Shanghai",
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();

      transaction
        .insert(categories)
        .values(defaultCategoryRows(userId, locale, timestamp))
        .run();
    });

    return accountDto(
      database.select().from(users).where(eq(users.id, userId)).get()!,
    );
  }

  async function reauthenticateAdmin(
    actorUserId: string,
    password: string,
  ) {
    const actor = requireAdmin(actorUserId);
    const decision = loginAttemptLimiter.checkAndRecordAttempt(actor.email);
    if (!decision.allowed) {
      throw new AccountManagementError(
        429,
        "ADMIN_REAUTH_RATE_LIMITED",
        "Too many verification attempts. Try again later",
        decision.retryAfterSeconds,
      );
    }

    if (!(await verifyPassword(password, actor.passwordHash))) {
      loginAttemptLimiter.recordFailure(actor.email);
      throw new AccountManagementError(
        403,
        "ADMIN_PASSWORD_INVALID",
        "Incorrect current administrator password",
      );
    }
    loginAttemptLimiter.recordSuccess(actor.email);
  }

  async function resetPassword(
    actorUserId: string,
    targetUserId: string,
    input: AccountPasswordResetInput,
  ) {
    await reauthenticateAdmin(actorUserId, input.adminPassword);
    const target = database
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .get();
    if (!target) {
      throw new AccountManagementError(
        404,
        "ACCOUNT_NOT_FOUND",
        "Account not found",
      );
    }

    const passwordHash = await hashPassword(input.newPassword);
    const timestamp = new Date().toISOString();
    database.transaction((transaction) => {
      transaction
        .update(users)
        .set({ passwordHash, updatedAt: timestamp })
        .where(eq(users.id, targetUserId))
        .run();
      transaction
        .delete(sessions)
        .where(eq(sessions.userId, targetUserId))
        .run();
    });

    return { requiresReauthentication: actorUserId === targetUserId };
  }

  function setDisabled(
    actorUserId: string,
    targetUserId: string,
    disabled: boolean,
  ) {
    requireAdmin(actorUserId);
    const target = database
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .get();
    if (!target) {
      throw new AccountManagementError(
        404,
        "ACCOUNT_NOT_FOUND",
        "Account not found",
      );
    }
    if (target.role === "admin") {
      throw new AccountManagementError(
        409,
        "ADMIN_STATUS_IMMUTABLE",
        "The sole administrator cannot be disabled",
      );
    }

    const timestamp = new Date().toISOString();
    database.transaction((transaction) => {
      transaction
        .update(users)
        .set({
          disabledAt: disabled ? timestamp : null,
          updatedAt: timestamp,
        })
        .where(eq(users.id, targetUserId))
        .run();
      if (disabled) {
        transaction
          .delete(sessions)
          .where(eq(sessions.userId, targetUserId))
          .run();
      }
    });

    return accountDto(
      database.select().from(users).where(eq(users.id, targetUserId)).get()!,
    );
  }

  return { list, createMember, resetPassword, setDisabled };
}

export const accountManagementService = createAccountManagementService();
