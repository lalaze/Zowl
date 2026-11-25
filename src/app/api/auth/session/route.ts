import { dataResponse, errorResponse } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  }

  return dataResponse({ user });
}
