import { eq } from "drizzle-orm";

import { db, type Database } from "@/db/client";
import { users } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session-store";
import { verifyPassword } from "@/lib/password";
import {
  loginAttemptLimiter,
  type LoginAttemptLimiter,
} from "@/services/auth-service/login-attempt-limiter";

export type Credentials = {
  email: string;
  password: string;
};

export type LoginAuthenticationResult =
  | { status: "authenticated"; user: SessionUser }
  | { status: "invalid" }
  | { status: "disabled" }
  | { status: "not_initialized" }
  | { status: "rate_limited"; retryAfterSeconds: number };

const UNKNOWN_ACCOUNT_PASSWORD_HASH =
  "scrypt$emVtb25leS1sb2dpbi1wYWRkaW5nLXYx$_uaQd7MXEdASOVZXMZwVxLD-GTZyn4XB9riYFc3b6ONJ_jkOWd1ozgYr3oq1eT1WK_nBf1mloqqZWdBIzOh27A";

type AuthServiceOptions = {
  limiter?: LoginAttemptLimiter;
  passwordVerifier?: typeof verifyPassword;
};

export function createAuthService(
  database: Database = db,
  options: AuthServiceOptions = {},
) {
  const limiter = options.limiter ?? loginAttemptLimiter;
  const passwordVerifier = options.passwordVerifier ?? verifyPassword;

  async function authenticate(
    credentials: Credentials,
  ): Promise<SessionUser | null> {
    const user = database
      .select()
      .from(users)
      .where(eq(users.email, credentials.email))
      .get();

    const passwordMatches = await passwordVerifier(
      credentials.password,
      user?.passwordHash ?? UNKNOWN_ACCOUNT_PASSWORD_HASH,
    );
    if (!user || !passwordMatches || user.disabledAt) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      avatarPreset: user.avatarPreset,
      timezone: user.timezone,
    };
  }

  async function authenticateLogin(
    credentials: Credentials,
  ): Promise<LoginAuthenticationResult> {
    const decision = limiter.checkAndRecordAttempt(credentials.email);
    if (!decision.allowed) {
      return {
        status: "rate_limited",
        retryAfterSeconds: decision.retryAfterSeconds,
      };
    }

    const user = database
      .select()
      .from(users)
      .where(eq(users.email, credentials.email))
      .get();
    const passwordMatches = await passwordVerifier(
      credentials.password,
      user?.passwordHash ?? UNKNOWN_ACCOUNT_PASSWORD_HASH,
    );

    if (!user) {
      const initialized = Boolean(
        database.select({ id: users.id }).from(users).limit(1).get(),
      );
      limiter.recordFailure(credentials.email);
      return initialized ? { status: "invalid" } : { status: "not_initialized" };
    }
    if (!passwordMatches) {
      limiter.recordFailure(credentials.email);
      return { status: "invalid" };
    }
    if (user.disabledAt) {
      limiter.recordSuccess(credentials.email);
      return { status: "disabled" };
    }

    limiter.recordSuccess(credentials.email);
    return {
      status: "authenticated",
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        avatarPreset: user.avatarPreset,
        timezone: user.timezone,
      },
    };
  }

  return { authenticate, authenticateLogin };
}

export const authService = createAuthService();
