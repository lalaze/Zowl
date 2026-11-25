import { ledgerCommandDigest } from "@/services/ledger-transaction/digest";

export type DuplicateAssessment = {
  status: "unique" | "possible_duplicate" | "duplicate";
  fingerprint: string;
  reasonCode: string | null;
  matchedTransactionId: string | null;
  matchedCandidateRef: string | null;
  algorithmVersion: number;
};

type DeduplicationAssessment = {
  status: DuplicateAssessment["status"];
  fingerprint: string;
  reasonCode: string | null;
  transactionId: string | null;
  algorithmVersion: number;
};

type DuplicateOverride = { assessmentDigest: string };

export function duplicateAssessmentDigest(assessment: DuplicateAssessment) {
  return ledgerCommandDigest(assessment);
}

export function toDuplicateAssessment(
  assessment: DeduplicationAssessment,
): DuplicateAssessment {
  return {
    status: assessment.status,
    fingerprint: assessment.fingerprint,
    reasonCode: assessment.reasonCode,
    matchedTransactionId: assessment.transactionId,
    matchedCandidateRef: null,
    algorithmVersion: assessment.algorithmVersion,
  };
}

export function resolveReviewDecision(input: {
  valid: boolean;
  assessment: DuplicateAssessment;
  choice: "post" | "skip";
  override: DuplicateOverride | null;
}): "pending" | "duplicate" | "skipped" | "post" {
  if (!input.valid) return "pending";
  if (input.assessment.status === "duplicate") return "duplicate";
  if (input.choice === "skip") return "skipped";
  if (input.assessment.status === "unique") return "post";
  return input.override?.assessmentDigest ===
    duplicateAssessmentDigest(input.assessment)
    ? "post"
    : "pending";
}
