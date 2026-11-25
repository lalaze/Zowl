import { ZodError } from "zod";

import {
  dataResponse,
  errorResponse,
  invalidJsonResponse,
  isSameOrigin,
  localizedDataResponse,
  serviceErrorResponse,
  validationErrorResponse,
} from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/session";
import {
  manualPostingAdapter,
  manualPostingInputSchema,
} from "@/services/ledger-transaction/manual-adapter";
import { transactionService } from "@/services/transaction-service";
import {
  transactionListQuerySchema,
} from "@/services/transaction-service/schema";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  }

  const searchParams = new URL(request.url).searchParams;

  try {
    const query = transactionListQuerySchema.parse({
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      categoryId: searchParams.get("categoryId") ?? undefined,
      uncategorized: searchParams.get("uncategorized") ?? undefined,
      currency: searchParams.get("currency") ?? undefined,
      source: searchParams.get("source") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      keyword: searchParams.get("keyword") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    return dataResponse(transactionService.listPage(user.id, query));
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return serviceErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return errorResponse(401, "UNAUTHENTICATED", "Sign in first");
  }

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
    const input = manualPostingInputSchema.parse(body);
    const result = manualPostingAdapter.confirm(user.id, input);
    if (result.status === "needs_review") {
      return localizedDataResponse(result, { status: 409 });
    }
    return dataResponse(
      {
        ...result.transaction,
        postingConfirmation: {
          id: result.confirmationId,
          outcome: result.outcome,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error);
    return serviceErrorResponse(error);
  }
}
