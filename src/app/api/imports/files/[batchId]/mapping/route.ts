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
import { fieldMappingSchema, importService } from "@/services/import-service";

type RouteContext = { params: Promise<{ batchId: string }> };

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
    const mapping = fieldMappingSchema.parse(body);
    const { batchId } = await context.params;
    return dataResponse(await importService.updateMapping(user.id, batchId, mapping));
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return serviceErrorResponse(error);
  }
}
