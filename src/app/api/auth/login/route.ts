import { z } from "zod";

import {
  dataResponse,
  errorResponse,
  invalidJsonResponse,
  isSameOrigin,
  validationErrorResponse,
} from "@/lib/api-response";
import { createSession } from "@/lib/auth/session";
import { authService } from "@/services/auth-service";

const loginSchema = z.object({
  email: z.email("Enter a valid email address").transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Enter your password").max(200),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return errorResponse(403, "ORIGIN_MISMATCH", "Untrusted request origin");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJsonResponse();
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const result = await authService.authenticateLogin(parsed.data);
  if (result.status === "rate_limited") {
    return errorResponse(
      429,
      "RATE_LIMITED",
      "Too many login attempts. Try again later",
      undefined,
      { headers: { "Retry-After": String(result.retryAfterSeconds) } },
    );
  }
  if (result.status === "invalid") {
    return errorResponse(401, "INVALID_CREDENTIALS", "Incorrect email or password");
  }
  if (result.status === "disabled") {
    return errorResponse(403, "ACCOUNT_DISABLED", "Account disabled. Contact the administrator");
  }
  if (result.status === "not_initialized") {
    return errorResponse(
      503,
      "NOT_INITIALIZED",
      "System not initialized. Create an administrator through the web app first",
    );
  }

  await createSession(result.user.id);
  return dataResponse({ user: result.user });
}
