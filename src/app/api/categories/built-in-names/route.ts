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
  builtInNamesInputSchema,
  categoryManagementService,
} from "@/services/category-management-service";

/**
 * Renames built-in categories that still carry the other language's default
 * name to `locale`'s name. Returns how many were renamed and skipped (target
 * name already taken), plus the updated categories and merchant rules.
 */
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
    const { locale } = builtInNamesInputSchema.parse(body);
    return dataResponse(categoryManagementService.applyBuiltInNames(user.id, locale));
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return errorResponse(500, "INTERNAL_ERROR", "Service temporarily unavailable. Try again later");
  }
}
