import {
  dataResponse,
  errorResponse,
  invalidJsonResponse,
  isSameOrigin,
} from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import {
  accountCreateInputSchema,
  accountListQuerySchema,
  accountManagementService,
} from "@/services/account-management-service";

import { accountManagementErrorResponse } from "./error-response";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  if (user.role !== "admin") {
    return errorResponse(403, "ADMIN_REQUIRED", "Only administrators can manage accounts");
  }

  try {
    const url = new URL(request.url);
    const query = accountListQuerySchema.parse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    return dataResponse(accountManagementService.list(user.id, query));
  } catch (error) {
    return accountManagementErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  if (user.role !== "admin") {
    return errorResponse(403, "ADMIN_REQUIRED", "Only administrators can manage accounts");
  }
  if (!isSameOrigin(request)) {
    return errorResponse(403, "ORIGIN_MISMATCH", "Untrusted request origin");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJsonResponse();
  }

  try {
    const input = accountCreateInputSchema.parse(body);
    return dataResponse(
      await accountManagementService.createMember(user.id, input, await getLocale()),
      { status: 201 },
    );
  } catch (error) {
    return accountManagementErrorResponse(error);
  }
}
