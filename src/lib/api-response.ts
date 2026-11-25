import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  localizeFieldErrors,
  localizeServerData,
  localizeServerMessage,
} from "@/lib/i18n/server-messages";
import { getLocale } from "@/lib/i18n/server";

import { LedgerTransactionError } from "@/services/ledger-transaction";
import { FileStorageError } from "@/services/file-storage-service";
import { ImportServiceError } from "@/services/import-service";
import { ReceiptRecognitionError } from "@/services/receipt-recognition-service";
import { ScreenshotRecognitionServiceError } from "@/services/screenshot-recognition-service/error";
import { AiCategorizationError } from "@/services/ai-categorization-service/error";
import { NotificationCaptureServiceError } from "@/services/notification-capture-service/error";

export function dataResponse<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

/**
 * Data that carries server-authored copy clients show verbatim (row warnings
 * and errors, validation issues, provider disclosures), in the requester's
 * language. See `localizeServerData` for the fields it rewrites.
 */
export async function localizedDataResponse<T>(data: T, init?: ResponseInit) {
  return dataResponse(localizeServerData(data, await getLocale()), init);
}

/**
 * Error body in the requester's language (cookie, else Accept-Language).
 * Services keep raising English messages; they are translated only here.
 */
export async function errorResponse(
  status: number,
  code: string,
  message: string,
  fieldErrors?: Record<string, string[] | undefined>,
  init?: Omit<ResponseInit, "status">,
) {
  const locale = await getLocale();
  return NextResponse.json(
    {
      error: {
        code,
        message: localizeServerMessage(message, locale),
        ...(fieldErrors
          ? { fieldErrors: localizeFieldErrors(fieldErrors, locale) }
          : {}),
      },
    },
    { ...init, status },
  );
}

export function invalidJsonResponse() {
  return errorResponse(400, "INVALID_JSON", "Request body is not valid JSON");
}

export function validationErrorResponse(error: ZodError) {
  return errorResponse(
    422,
    "VALIDATION_ERROR",
    "Check your entries",
    error.flatten().fieldErrors,
  );
}

export function serviceErrorResponse(error: unknown) {
  if (error instanceof LedgerTransactionError) {
    return errorResponse(error.status, error.code, error.message);
  }
  if (error instanceof ImportServiceError || error instanceof FileStorageError) {
    return errorResponse(error.status, error.code, error.message);
  }
  if (
    error instanceof ScreenshotRecognitionServiceError ||
    error instanceof ReceiptRecognitionError
  ) {
    return errorResponse(error.status, error.code, error.message);
  }
  if (error instanceof AiCategorizationError) {
    return errorResponse(error.status, error.code, error.message);
  }
  if (error instanceof NotificationCaptureServiceError) {
    return errorResponse(error.status, error.code, error.message);
  }

  return errorResponse(500, "INTERNAL_ERROR", "Service temporarily unavailable. Try again later");
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    if (process.env.NODE_ENV === "production") {
      const publicBaseUrl = process.env.PUBLIC_BASE_URL;
      if (!publicBaseUrl) return false;

      const expected = new URL(publicBaseUrl);
      return (
        expected.protocol === "https:" && new URL(origin).origin === expected.origin
      );
    }

    const host = request.headers.get("host");
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}
