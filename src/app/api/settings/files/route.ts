import { ZodError } from "zod";

import {
  dataResponse,
  errorResponse,
  validationErrorResponse,
} from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import {
  accountSettingsService,
  storedFilesQuerySchema,
} from "@/services/category-management-service/account-settings";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  const params = new URL(request.url).searchParams;
  try {
    const query = storedFilesQuerySchema.parse({
      page: params.get("page") ?? undefined,
      limit: params.get("limit") ?? undefined,
    });
    return dataResponse(accountSettingsService.listFiles(user.id, query));
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    throw error;
  }
}
