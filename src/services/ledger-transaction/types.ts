import type { DuplicateAssessment } from "@/services/ledger-transaction/review-decision";

export type ConfirmationOutcomeItem = {
  sourceItemRef: string;
  outcome: "posted" | "duplicate" | "skipped";
  transactionId: string | null;
  revisionId: string | null;
};

export type NeedsReviewItem = {
  sourceItemRef: string;
  assessment: DuplicateAssessment | null;
  assessmentDigest: string | null;
  validationIssues: Array<{
    code: "invalid_category";
    message: string;
  }>;
};

export type ConfirmationOutcome =
  | {
      status: "completed";
      confirmationId: string;
      items: ConfirmationOutcomeItem[];
    }
  | {
      status: "needs_review";
      confirmationId: string;
      items: NeedsReviewItem[];
    };

export type TransactionRevisionOutcome =
  | {
      status: "completed";
      transactionId: string;
      revisionId: string;
      revisionNumber: number;
    }
  | {
      status: "revision_conflict";
      transactionId: string;
      currentRevisionId: string | null;
    }
  | {
      status: "needs_review";
      transactionId: string;
      assessment: DuplicateAssessment;
      assessmentDigest: string;
    };

export type TransactionVoidOutcome =
  | {
      status: "completed";
      operationId: string;
      targets: Array<{
        transactionId: string;
        revisionId: string;
        revisionNumber: number;
      }>;
    }
  | {
      status: "revision_conflict";
      transactionId: string;
      currentRevisionId: string | null;
    };
