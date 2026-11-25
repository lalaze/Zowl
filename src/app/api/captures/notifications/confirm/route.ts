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

export async function POST(request: Request) {
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
    return localizedDataResponse(notificationCaptureService.confirmMany(user.id, body));
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return serviceErrorResponse(error);
  }
}
