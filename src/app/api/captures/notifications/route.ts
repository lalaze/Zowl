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
import { getLocale } from "@/lib/i18n/server";
import { notificationCaptureService } from "@/services/notification-capture-service";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  const params = new URL(request.url).searchParams;
  try {
    return localizedDataResponse(
      notificationCaptureService.list(user.id, {
        status: params.get("status") ?? undefined,
        page: params.get("page") ?? undefined,
        limit: params.get("limit") ?? undefined,
      }),
    );
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return serviceErrorResponse(error);
  }
}

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
    return localizedDataResponse(
      // Generated descriptions and AI reasons follow the device's language.
      await notificationCaptureService.ingest(user.id, body, await getLocale()),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return serviceErrorResponse(error);
  }
}
