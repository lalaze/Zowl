import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db/client";
import {
  createSessionStore,
  type IssuedSession,
  type SessionUser,
} from "@/lib/auth/session-store";

const SESSION_COOKIE = "zemoney_session";
const sessionStore = createSessionStore(db);

export type { SessionUser } from "@/lib/auth/session-store";

type RequestSessionToken =
  | { source: "bearer" | "cookie"; token: string }
  | { source: "invalid_bearer"; token: null }
  | { source: "none"; token: null };

function parseBearer(value: string) {
  const match = /^Bearer\s+([A-Za-z0-9_-]+)$/u.exec(value.trim());
  return match?.[1] ?? null;
}

async function requestSessionToken(): Promise<RequestSessionToken> {
  const authorization = (await headers()).get("authorization");
  if (authorization !== null) {
    const token = parseBearer(authorization);
    return token
      ? { source: "bearer", token }
      : { source: "invalid_bearer", token: null };
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  return token
    ? { source: "cookie", token }
    : { source: "none", token: null };
}

export async function createSession(userId: string) {
  const issued = sessionStore.issue(userId);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, issued.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(issued.expiresAt),
  });
}

export function issueBearerSession(userId: string): IssuedSession {
  return sessionStore.issue(userId);
}

export async function clearSession() {
  const credentials = await requestSessionToken();
  if (credentials.token) sessionStore.revoke(credentials.token);
  if (credentials.source === "cookie") {
    (await cookies()).delete(SESSION_COOKIE);
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const credentials = await requestSessionToken();
  return credentials.token ? sessionStore.findUser(credentials.token) : null;
}

/**
 * Per-request memoized variant for React Server Component rendering only.
 * Leave API route handlers and session-mutating paths on `getCurrentUser()`.
 */
export const getCurrentUserForRender = cache(getCurrentUser);

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireCurrentUserForRender() {
  const user = await getCurrentUserForRender();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdministrator() {
  const user = await requireCurrentUser();
  if (user.role !== "admin") redirect("/settings");
  return user;
}

export async function requireAdministratorForRender() {
  const user = await requireCurrentUserForRender();
  if (user.role !== "admin") redirect("/settings");
  return user;
}
