import { ZodError } from "zod";

import {
  dataResponse,
  errorResponse,
  invalidJsonResponse,
  isSameOrigin,
  validationErrorResponse,
} from "@/lib/api-response";
import { createSession } from "@/lib/auth/session";
import { getLocale } from "@/lib/i18n/server";
import {
  setupAdminInputSchema,
  setupService,
  SetupServiceError,
} from "@/services/setup-service";

export async function POST(request: Request) {
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
    const input = setupAdminInputSchema.parse(body);
    const user = await setupService.initializeAdmin(input, await getLocale());
    await createSession(user.id);
    return dataResponse({ user: { ...user, role: "admin" as const } }, {
      status: 201,
    });
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    if (error instanceof SetupServiceError) {
      return errorResponse(error.status, error.code, error.message);
    }
    return errorResponse(500, "INTERNAL_ERROR", "Initialization failed. Try again later");
  }
}
