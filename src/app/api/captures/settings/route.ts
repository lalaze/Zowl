import { ZodError } from "zod";

import {
  dataResponse,
  errorResponse,
  invalidJsonResponse,
  isSameOrigin,
  serviceErrorResponse,
  validationErrorResponse,
} from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import { notificationCaptureService } from "@/services/notification-capture-service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Please log in first");
  try {
    return dataResponse(notificationCaptureService.getSettings(user.id));
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Please log in first");
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
    return dataResponse(notificationCaptureService.updateSettings(user.id, body));
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return serviceErrorResponse(error);
  }
}
