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
import { transactionAmendmentAdapter } from "@/services/ledger-transaction/amendment-adapter";
import { ledgerTransactionService } from "@/services/ledger-transaction";
import { transactionService } from "@/services/transaction-service";
import {
  transactionAmendmentInputSchema,
  transactionVoidInputSchema,
} from "@/services/transaction-service/schema";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Sign in first");

  const { id } = await context.params;
  const transaction = transactionService.get(user.id, id);

  if (!transaction) {
    return errorResponse(404, "TRANSACTION_NOT_FOUND", "Transaction not found");
  }

  return dataResponse(transaction);
}

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
    const input = transactionAmendmentInputSchema.parse(body);
    const { id } = await context.params;
    const result = transactionAmendmentAdapter.amend(user.id, id, input);
    if (result.status !== "completed") {
      return dataResponse(result, { status: 409 });
    }
    return dataResponse({
      ...result.transaction,
      transactionRevision: {
        id: result.revisionId,
        number: result.revisionNumber,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return serviceErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
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
    const input = transactionVoidInputSchema.parse(body);
    const { id } = await context.params;
    const outcome = ledgerTransactionService.voidTransaction(user.id, {
      operationId: input.operationId,
      targets: [
        {
          transactionId: id,
          expectedRevisionId: input.expectedRevisionId,
        },
      ],
    });
    if (outcome.status === "revision_conflict") {
      return dataResponse(outcome, { status: 409 });
    }
    return dataResponse({
      id,
      operationId: outcome.operationId,
      transactionRevision: outcome.targets[0],
    });
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return serviceErrorResponse(error);
  }
}
