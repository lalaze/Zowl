import {
  dataResponse,
  errorResponse,
  isSameOrigin,
} from "@/lib/api-response";
import { clearSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return errorResponse(403, "ORIGIN_MISMATCH", "Untrusted request origin");
  }

  await clearSession();
  return dataResponse({ success: true });
}
