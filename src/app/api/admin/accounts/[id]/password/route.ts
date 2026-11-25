import {
  dataResponse,
  errorResponse,
  invalidJsonResponse,
  isSameOrigin,
} from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import {
  accountManagementService,
  accountPasswordResetInputSchema,
} from "@/services/account-management-service";

import { accountManagementErrorResponse } from "../../error-response";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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
    const { id } = await context.params;
    const input = accountPasswordResetInputSchema.parse(body);
    return dataResponse(
      await accountManagementService.resetPassword(user.id, id, input),
    );
  } catch (error) {
    return accountManagementErrorResponse(error);
  }
}
