import {
  dataResponse,
  errorResponse,
  isSameOrigin,
  serviceErrorResponse,
} from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import { screenshotRecognitionService } from "@/services/screenshot-recognition-service";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  if (!isSameOrigin(request)) {
    return errorResponse(403, "ORIGIN_MISMATCH", "Untrusted request origin");
  }
  try {
    const { jobId } = await context.params;
    return dataResponse(screenshotRecognitionService.confirm(user.id, jobId));
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
