import { ZodError } from "zod";

import {
  errorResponse,
  isSameOrigin,
  localizedDataResponse,
  serviceErrorResponse,
  validationErrorResponse,
} from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import {
  accountSettingsService,
  AccountSettingsError,
  storedFileIdSchema,
} from "@/services/category-management-service/account-settings";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  if (!isSameOrigin(request)) {
    return errorResponse(403, "ORIGIN_MISMATCH", "Untrusted request origin");
  }
  try {
    const { id } = await context.params;
    return localizedDataResponse(
      await accountSettingsService.removeFile(
        user.id,
        storedFileIdSchema.parse(id),
      ),
    );
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    if (error instanceof AccountSettingsError) {
      return errorResponse(error.status, error.code, error.message);
    }
    return serviceErrorResponse(error);
  }
}
