import { ZodError } from "zod";

import {
  errorResponse,
  invalidJsonResponse,
  isSameOrigin,
  localizedDataResponse,
  serviceErrorResponse,
  validationErrorResponse,
} from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import { notificationCaptureService } from "@/services/notification-capture-service";

type RouteContext = { params: Promise<{ captureId: string }> };

export async function GET(_: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  try {
    const { captureId } = await context.params;
    return localizedDataResponse(notificationCaptureService.get(user.id, captureId));
  } catch (error) {
    return serviceErrorResponse(error);
  }
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
    const { captureId } = await context.params;
    return localizedDataResponse(
      notificationCaptureService.edit(user.id, captureId, body),
    );
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return serviceErrorResponse(error);
  }
}
