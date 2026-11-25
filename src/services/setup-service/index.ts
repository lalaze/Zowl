import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";

import { count } from "drizzle-orm";
import { z } from "zod";

import { db, type Database } from "@/db/client";
import { users } from "@/db/schema";
import { defaultLocale, type Locale } from "@/lib/i18n/locale";
import {
  AccountInitializationError,
  initializeAccount,
} from "@/services/account-initialization-service";

export const setupAdminInputSchema = z.object({
  setupToken: z.string().min(1, "Enter the setup secret").max(1_000),
  email: z.email("Enter a valid email address").transform((value) => value.toLowerCase()),
  displayName: z
    .string()
    .trim()
    .min(1, "Enter a nickname")
    .max(40, "Nickname must not exceed 40 characters")
    .optional(),
  password: z
    .string()
    .min(12, "Password must contain at least 12 characters")
    .max(200, "Password must not exceed 200 characters"),
});

export type SetupAdminInput = z.infer<typeof setupAdminInputSchema>;

export class SetupServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code:
      | "ALREADY_INITIALIZED"
      | "SETUP_UNAVAILABLE"
      | "INVALID_SETUP_TOKEN",
    message: string,
  ) {
    super(message);
    this.name = "SetupServiceError";
  }
}

async function loadConfiguredSetupToken() {
  const path = process.env.INITIAL_ADMIN_SETUP_TOKEN_FILE?.trim();
  if (!path) {
    throw new SetupServiceError(
      503,
      "SETUP_UNAVAILABLE",
      "Administrator setup secret is not configured on the server",
    );
  }

  let token: string;
  try {
    token = (await readFile(path, "utf8")).replace(/\r?\n$/u, "");
  } catch {
    throw new SetupServiceError(
      503,
      "SETUP_UNAVAILABLE",
      "Administrator setup secret file is unavailable",
    );
  }
  if (token.length < 32) {
    throw new SetupServiceError(
      503,
      "SETUP_UNAVAILABLE",
      "Administrator setup secret must contain at least 32 characters",
    );
  }
  return token;
}

type SetupServiceOptions = {
  setupTokenLoader?: () => Promise<string>;
};

function tokenDigest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function createSetupService(
  database: Database = db,
  options: SetupServiceOptions = {},
) {
  const setupTokenLoader =
    options.setupTokenLoader ?? loadConfiguredSetupToken;

  function isInitialized() {
    return (
      (database.select({ value: count() }).from(users).get()?.value ?? 0) > 0
    );
  }

  async function initializeAdmin(
    input: SetupAdminInput,
    locale: Locale = defaultLocale,
  ) {
    if (isInitialized()) {
      throw new SetupServiceError(
        409,
        "ALREADY_INITIALIZED",
        "System already initialized",
      );
    }

    const configuredToken = await setupTokenLoader();
    if (
      !timingSafeEqual(
        tokenDigest(input.setupToken),
        tokenDigest(configuredToken),
      )
    ) {
      throw new SetupServiceError(
        403,
        "INVALID_SETUP_TOKEN",
        "Incorrect setup secret",
      );
    }

    try {
      return await initializeAccount(database, {
        email: input.email,
        password: input.password,
        displayName: input.displayName,
        locale,
      });
    } catch (error) {
      if (
        error instanceof AccountInitializationError &&
        error.code === "USER_ALREADY_EXISTS"
      ) {
        throw new SetupServiceError(
          409,
          "ALREADY_INITIALIZED",
          "System already initialized",
        );
      }
      throw error;
    }
  }

  return { isInitialized, initializeAdmin };
}

export const setupService = createSetupService();
