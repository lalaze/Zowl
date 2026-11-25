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
  categoryIdSchema,
  categoryManagementService,
  CategoryManagementError,
  categoryUpdateSchema,
} from "@/services/category-management-service";

type RouteContext = { params: Promise<{ id: string }> };

function categoryErrorResponse(error: CategoryManagementError) {
  return errorResponse(error.status, error.code, error.message);
}

export async function PATCH(request: Request, context: RouteContext) {
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
    const { id } = await context.params;
    return dataResponse(
      categoryManagementService.update(
        user.id,
        categoryIdSchema.parse(id),
        categoryUpdateSchema.parse(body),
      ),
    );
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    if (error instanceof CategoryManagementError) {
      return categoryErrorResponse(error);
    }
    return errorResponse(500, "INTERNAL_ERROR", "Service temporarily unavailable. Try again later");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  if (!isSameOrigin(request)) {
    return errorResponse(403, "ORIGIN_MISMATCH", "Untrusted request origin");
  }

  try {
    const { id } = await context.params;
    return dataResponse(
      categoryManagementService.remove(user.id, categoryIdSchema.parse(id)),
    );
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    if (error instanceof CategoryManagementError) {
      return categoryErrorResponse(error);
    }
    return errorResponse(500, "INTERNAL_ERROR", "Service temporarily unavailable. Try again later");
  }
}
