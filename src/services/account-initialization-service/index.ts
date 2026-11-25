import { randomUUID } from "node:crypto";

import type { Database } from "@/db/client";
import { categories, users } from "@/db/schema";
import { defaultAvatarPreset } from "@/lib/avatar-presets";
import { defaultCategoryRows } from "@/lib/default-categories";
import { defaultLocale, type Locale } from "@/lib/i18n/locale";
import { hashPassword } from "@/lib/password";

export class AccountInitializationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "USER_ALREADY_EXISTS"
      | "INVALID_EMAIL"
      | "PASSWORD_TOO_SHORT",
  ) {
    super(message);
    this.name = "AccountInitializationError";
  }
}

export type InitialAccountInput = {
  email: string;
  password: string;
  displayName?: string;
  timezone?: string;
  /** Language of the built-in category names; the requester's UI language. */
  locale?: Locale;
};

export async function initializeAccount(
  database: Database,
  input: InitialAccountInput,
) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new AccountInitializationError("Invalid initial user email", "INVALID_EMAIL");
  }
  if (input.password.length < 12) {
    throw new AccountInitializationError(
      "Initial password must contain at least 12 characters",
      "PASSWORD_TOO_SHORT",
    );
  }

  if (database.select({ id: users.id }).from(users).limit(1).get()) {
    throw new AccountInitializationError(
      "Users already exist in the database; refusing to overwrite",
      "USER_ALREADY_EXISTS",
    );
  }

  const userId = randomUUID();
  const timestamp = new Date().toISOString();
  const passwordHash = await hashPassword(input.password);

  database.transaction((transaction) => {
    if (transaction.select({ id: users.id }).from(users).limit(1).get()) {
      throw new AccountInitializationError(
        "Users already exist in the database; refusing to overwrite",
        "USER_ALREADY_EXISTS",
      );
    }

    transaction
      .insert(users)
      .values({
        id: userId,
        email,
        passwordHash,
        displayName:
          input.displayName?.trim() || email.slice(0, email.indexOf("@")),
        role: "admin",
        avatarPreset: defaultAvatarPreset,
        timezone: input.timezone?.trim() || "Asia/Shanghai",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    transaction
      .insert(categories)
      .values(
        defaultCategoryRows(userId, input.locale ?? defaultLocale, timestamp),
      )
      .run();
  });

  return { id: userId, email };
}
