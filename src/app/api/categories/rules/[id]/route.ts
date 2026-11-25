import { ZodError } from "zod";

import {
  dataResponse,
  errorResponse,
  isSameOrigin,
  validationErrorResponse,
} from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import {
  categoryManagementService,
  CategoryManagementError,
  merchantRuleIdSchema,
} from "@/services/category-management-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  if (!isSameOrigin(request)) {
    return errorResponse(403, "ORIGIN_MISMATCH", "Untrusted request origin");
  }
  try {
    const { id } = await context.params;
    return dataResponse(
      categoryManagementService.removeMerchantRule(
        user.id,
        merchantRuleIdSchema.parse(id),
      ),
    );
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    if (error instanceof CategoryManagementError) {
      return errorResponse(error.status, error.code, error.message);
    }
    return errorResponse(500, "INTERNAL_ERROR", "Service temporarily unavailable. Try again later");
  }
}
