import type { duplicateStatuses, importDecisions } from "@/db/schema";
import type { LedgerFacts } from "@/services/ledger-transaction/schema";
import type { ConfirmationOutcomeItem } from "@/services/ledger-transaction/types";

export type StagedResultCode =
  | "IMPORTED"
  | "SKIPPED_DUPLICATE"
  | "SKIPPED_POSSIBLE_DUPLICATE"
  | "SKIPPED_INVALID"
  | "SKIPPED_BY_USER";

export function stagedCandidateFacts(data: LedgerFacts): LedgerFacts {
  return {
    type: data.type,
    amountMinor: data.amountMinor,
    currency: data.currency,
    merchantName: data.merchantName,
    description: data.description,
    categoryId: data.categoryId,
    transactionTime: data.transactionTime,
    paymentMethod: data.paymentMethod,
  };
}

export function stagedDuplicateOverride(item: {
  decision: (typeof importDecisions)[number];
  duplicateAssessmentDigest: string | null;
}) {
  return item.decision === "import_anyway" && item.duplicateAssessmentDigest
    ? { assessmentDigest: item.duplicateAssessmentDigest }
    : undefined;
}

export function stagedOutcomeResultCode(
  outcome: ConfirmationOutcomeItem,
  item: {
    duplicateStatus: (typeof duplicateStatuses)[number];
    validationErrors: readonly unknown[];
  },
): StagedResultCode {
  return outcome.outcome === "posted"
    ? "IMPORTED"
    : outcome.outcome === "duplicate"
      ? "SKIPPED_DUPLICATE"
      : item.duplicateStatus === "possible_duplicate"
        ? "SKIPPED_POSSIBLE_DUPLICATE"
        : item.validationErrors.length
          ? "SKIPPED_INVALID"
          : "SKIPPED_BY_USER";
}

export function stagedOutcomeColumns(
  outcome: ConfirmationOutcomeItem,
  item: {
    duplicateStatus: (typeof duplicateStatuses)[number];
    duplicateTransactionId: string | null;
    decision: (typeof importDecisions)[number];
    validationErrors: readonly unknown[];
  },
  updatedAt: string,
) {
  return {
    resultTransactionId:
      outcome.outcome === "posted" ? outcome.transactionId : null,
    resultCode: stagedOutcomeResultCode(outcome, item),
    duplicateStatus:
      outcome.outcome === "duplicate"
        ? ("duplicate" as const)
        : item.duplicateStatus,
    duplicateTransactionId:
      outcome.outcome === "duplicate"
        ? outcome.transactionId
        : item.duplicateTransactionId,
    decision:
      outcome.outcome === "duplicate" ? ("skip" as const) : item.decision,
    updatedAt,
  };
}
