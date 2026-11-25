import { z, ZodError } from "zod";

import {
  errorResponse,
  invalidJsonResponse,
  isSameOrigin,
  localizedDataResponse,
  serviceErrorResponse,
  validationErrorResponse,
} from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import {
  receiptDecisionSchema,
  receiptItemEditSchema,
  screenshotRecognitionService,
} from "@/services/screenshot-recognition-service";

const decisionRequestSchema = z
  .object({ decision: receiptDecisionSchema })
  .strict();
const adoptionRequestSchema = z.object({ action: z.literal("adopt_ai") }).strict();

type RouteContext = {
  params: Promise<{ jobId: string; itemId: string }>;
};

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
    const { jobId, itemId } = await context.params;
    const decisionRequest = decisionRequestSchema.safeParse(body);
    const adoptionRequest = adoptionRequestSchema.safeParse(body);
    const result = decisionRequest.success
      ? screenshotRecognitionService.setDecision(
          user.id,
          jobId,
          itemId,
          decisionRequest.data.decision,
        )
      : adoptionRequest.success
        ? screenshotRecognitionService.adoptAiCategorySuggestion(
            user.id,
            jobId,
            itemId,
          )
        : screenshotRecognitionService.updateItem(
            user.id,
            jobId,
            itemId,
            receiptItemEditSchema.parse(body),
          );
    return localizedDataResponse(result);
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return serviceErrorResponse(error);
  }
}
