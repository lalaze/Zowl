import { ZodError } from "zod";

import {
  dataResponse,
  errorResponse,
  invalidJsonResponse,
  isSameOrigin,
  serviceErrorResponse,
  validationErrorResponse,
} from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import { ledgerTransactionService } from "@/services/ledger-transaction";
import { bulkVoidSchema } from "@/services/transaction-service/schema";

export async function POST(request: Request) {
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
    const command = bulkVoidSchema.parse(body);
    const outcome = ledgerTransactionService.voidTransaction(user.id, command);
    if (outcome.status === "revision_conflict") {
      return dataResponse(outcome, { status: 409 });
    }
    return dataResponse({
      operationId: outcome.operationId,
      requestedCount: command.targets.length,
      voidedCount: outcome.targets.length,
      voidedIds: outcome.targets.map((target) => target.transactionId),
    });
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return serviceErrorResponse(error);
  }
}
