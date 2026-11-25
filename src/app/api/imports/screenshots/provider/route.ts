import { errorResponse, localizedDataResponse } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import { screenshotRecognitionService } from "@/services/screenshot-recognition-service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");

  return localizedDataResponse(screenshotRecognitionService.providerInfo());
}
