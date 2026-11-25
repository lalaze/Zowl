import {
  dataResponse,
  errorResponse,
  isSameOrigin,
  serviceErrorResponse,
} from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import { importService } from "@/services/import-service";

type RouteContext = { params: Promise<{ batchId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  if (!isSameOrigin(request)) {
    return errorResponse(403, "ORIGIN_MISMATCH", "Untrusted request origin");
  }

  try {
    const { batchId } = await context.params;
    const result = importService.confirm(user.id, batchId);
    return dataResponse({
      batchId,
      status: result.batch.status,
      importedCount: result.batch.importedCount,
      duplicateCount: result.batch.duplicateCount,
      skippedCount: result.batch.skippedCount,
      failedCount: result.batch.failedCount,
    });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
