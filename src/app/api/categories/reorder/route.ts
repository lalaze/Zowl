import { ZodError } from "zod";

import {
  dataResponse,
  errorResponse,
  invalidJsonResponse,
  isSameOrigin,
  validationErrorResponse,
} from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import {
  categoryManagementService,
  CategoryManagementError,
  categoryReorderSchema,
} from "@/services/category-management-service";

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
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
    const { ids } = categoryReorderSchema.parse(body);
    return dataResponse(categoryManagementService.reorder(user.id, ids));
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    if (error instanceof CategoryManagementError) {
      return errorResponse(error.status, error.code, error.message);
    }
    return errorResponse(500, "INTERNAL_ERROR", "Service temporarily unavailable. Try again later");
  }
}
