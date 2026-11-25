import { errorResponse, localizedDataResponse, serviceErrorResponse } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import { importService } from "@/services/import-service";

type RouteContext = { params: Promise<{ batchId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");

  try {
    const { batchId } = await context.params;
    const page = Number.parseInt(new URL(request.url).searchParams.get("page") ?? "1", 10);
    return localizedDataResponse(
      importService.getReview(user.id, batchId, {
        page: Number.isFinite(page) ? page : 1,
      }),
    );
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
