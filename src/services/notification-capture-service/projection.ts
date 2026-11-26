import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  notificationCaptureFieldOrigins,
  notificationCaptures,
} from "@/db/schema";
import { isPaymentPageParser } from "@/lib/capture-source";
import { publicOrderDetails } from "@/lib/order-details";
import type { OrderContextPage } from "@/services/ai-categorization-service";
import type { createCategorizationService } from "@/services/categorization-service";
import type { createDeduplicationService } from "@/services/deduplication-service";
import {
  duplicateAssessmentDigest,
  toDuplicateAssessment,
} from "@/services/ledger-transaction/review-decision";
import {
  ledgerFactsSchema,
  type LedgerFacts,
} from "@/services/ledger-transaction/schema";
import { NotificationCaptureServiceError } from "@/services/notification-capture-service/error";
import type { CapturePlatform } from "@/services/notification-capture-service/platforms";

export type FieldOrigin = (typeof notificationCaptureFieldOrigins)[number];
export type FieldOrigins = Record<
  "merchantName" | "description" | "paymentMethod" | "categoryId",
  FieldOrigin
>;

export type DuplicateCheckResult = ReturnType<
  ReturnType<typeof createDeduplicationService>["check"]
>;

export type DeduplicateCapture = (
  userId: string,
  platform: CapturePlatform,
  facts: LedgerFacts,
  source?: Database,
) => DuplicateCheckResult;

export type StagedCapture = {
  idempotencyKey: string;
  captureId: string;
  platform: CapturePlatform;
  facts: LedgerFacts;
  categoryRuleSource: ReturnType<
    ReturnType<typeof createCategorizationService>["suggest"]
  >["ruleSource"];
  duplicateStatus: "unique" | "possible_duplicate" | "duplicate";
  /** Held for this request only; never stored. */
  orderContext: OrderContextPage[] | null;
  /** The model was already asked about this candidate once. */
  orderDetailsAttempted: boolean;
};

export function notFound(): never {
  throw new NotificationCaptureServiceError(
    "NOTIFICATION_CAPTURE_NOT_FOUND",
    "Notification candidate not found",
    404,
  );
}

export function getCaptureRow(
  source: Database,
  userId: string,
  captureId: string,
) {
  return source
    .select()
    .from(notificationCaptures)
    .where(
      and(
        eq(notificationCaptures.id, captureId),
        eq(notificationCaptures.userId, userId),
      ),
    )
    .get();
}

export function parseFacts(value: unknown) {
  const parsed = ledgerFactsSchema.safeParse(value);
  if (!parsed.success) {
    throw new NotificationCaptureServiceError(
      "NOTIFICATION_CAPTURE_INVALID",
      "Notification candidate fields are stale. Edit again",
      409,
    );
  }
  return parsed.data;
}

export function resolvedFieldOrigins(
  row: typeof notificationCaptures.$inferSelect,
): FieldOrigins {
  const stored = row.fieldOrigins ?? {};
  return {
    merchantName: stored.merchantName ?? "legacy_unknown",
    description: stored.description ?? "legacy_unknown",
    paymentMethod: stored.paymentMethod ?? "legacy_unknown",
    categoryId: stored.categoryId ?? "legacy_unknown",
  };
}

export function project(row: typeof notificationCaptures.$inferSelect) {
  const facts = parseFacts(row.normalizedData);
  return {
    id: row.id,
    platform: row.platform,
    sourcePackage: row.sourcePackage,
    captureMethod: isPaymentPageParser(row.parserId)
      ? "payment_page"
      : "notification",
    notificationPostedAt: row.notificationPostedAt,
    parserId: row.parserId,
    parserVersion: row.parserVersion,
    confidenceBasisPoints: row.confidenceBasisPoints,
    ...facts,
    fieldOrigins: resolvedFieldOrigins(row),
    duplicateStatus: row.duplicateStatus,
    duplicateTransactionId: row.duplicateTransactionId,
    duplicateAssessmentDigest: row.duplicateAssessmentDigest,
    decision: row.decision,
    status: row.status,
    warnings: row.warnings,
    validationErrors: row.validationErrors,
    resultTransactionId: row.resultTransactionId,
    resultCode: row.resultCode,
    orderDetails: publicOrderDetails(row.orderDetails),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    confirmationVersion: row.confirmationVersion,
  };
}

export function duplicateColumns(duplicate: DuplicateCheckResult) {
  return {
    warnings: duplicate.reason ? [duplicate.reason] : [],
    duplicateStatus: duplicate.status,
    duplicateTransactionId: duplicate.transactionId,
    duplicateAssessmentDigest:
      duplicate.status === "possible_duplicate"
        ? duplicateAssessmentDigest(toDuplicateAssessment(duplicate))
        : null,
  };
}

export function completedResult(row: typeof notificationCaptures.$inferSelect) {
  const outcome =
    row.resultCode === "IMPORTED" || row.resultCode === "AUTO_POSTED"
      ? "posted"
      : row.resultCode === "SKIPPED_DUPLICATE" ||
          row.resultCode === "AUTO_SKIPPED_DUPLICATE"
        ? "duplicate"
        : "skipped";
  return {
    status: "completed" as const,
    capture: project(row),
    outcome: {
      sourceItemRef: row.id,
      outcome,
      transactionId:
        outcome === "duplicate"
          ? row.duplicateTransactionId
          : row.resultTransactionId,
      revisionId: null,
    },
  };
}
