import { ZodError } from "zod";

import { errorResponse, validationErrorResponse } from "@/lib/api-response";
import { AccountManagementError } from "@/services/account-management-service";

export function accountManagementErrorResponse(error: unknown) {
  if (error instanceof ZodError) return validationErrorResponse(error);
  if (error instanceof AccountManagementError) {
    return errorResponse(error.status, error.code, error.message, undefined, {
      headers: error.retryAfterSeconds
        ? { "Retry-After": String(error.retryAfterSeconds) }
        : undefined,
    });
  }
  return errorResponse(500, "INTERNAL_ERROR", "Service temporarily unavailable. Try again later");
}
