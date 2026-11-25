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
import { importService } from "@/services/import-service";
import { importItemEditSchema } from "@/services/import-service/cleaner";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("decision"),
    decision: z.enum(["skip", "import", "import_anyway"]),
  }),
  z.object({
    action: z.literal("update"),
    data: importItemEditSchema,
  }),
  z.object({ action: z.literal("adopt_ai") }),
  z.object({
    action: z.literal("resolve_enrichment"),
    resolutions: z.partialRecord(
      z.enum([
        "merchantName",
        "description",
        "paymentMethod",
        "categoryId",
      ]),
      z.enum(["keep_current", "use_bill"]),
    ),
  }),
]);

type RouteContext = {
  params: Promise<{ batchId: string; itemId: string }>;
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
    const input = requestSchema.parse(body);
    const { batchId, itemId } = await context.params;
    const result =
      input.action === "decision"
        ? importService.setItemDecision(
            user.id,
            batchId,
            itemId,
            input.decision,
          )
        : input.action === "update"
          ? importService.updateItem(user.id, batchId, itemId, input.data)
          : input.action === "adopt_ai"
            ? importService.adoptAiCategorySuggestion(user.id, batchId, itemId)
            : importService.setEnrichmentResolution(
                user.id,
                batchId,
                itemId,
                input.resolutions,
              );
    return localizedDataResponse(result);
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return serviceErrorResponse(error);
  }
}
