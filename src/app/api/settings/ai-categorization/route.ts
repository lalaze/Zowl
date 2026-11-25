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
import {
  aiCategorizationSettingsInputSchema,
  aiCategorizationSettingsService,
} from "@/services/ai-categorization-service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  return localizedDataResponse(aiCategorizationSettingsService.getState(user.id));
}

export async function PUT(request: Request) {
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
    const input = aiCategorizationSettingsInputSchema.parse(body);
    return localizedDataResponse(aiCategorizationSettingsService.save(user.id, input));
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return serviceErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  if (!isSameOrigin(request)) {
    return errorResponse(403, "ORIGIN_MISMATCH", "Untrusted request origin");
  }
  return localizedDataResponse(aiCategorizationSettingsService.reset(user.id));
}
