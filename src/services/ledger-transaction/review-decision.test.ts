import { describe, expect, it } from "vitest";

import {
  duplicateAssessmentDigest,
  resolveReviewDecision,
  toDuplicateAssessment,
  type DuplicateAssessment,
} from "@/services/ledger-transaction/review-decision";

describe("Ledger Review Decision", () => {
  const possibleDuplicate: DuplicateAssessment = {
    status: "possible_duplicate",
    fingerprint: "candidate-fingerprint",
    reasonCode: "same_amount_merchant_near_time",
    matchedTransactionId: "existing-transaction",
    matchedCandidateRef: null,
    algorithmVersion: 1,
  };

  it("only posts a Possible Duplicate with an override bound to its exact assessment", () => {
    const matchingDigest = duplicateAssessmentDigest(possibleDuplicate);

    expect(
      resolveReviewDecision({
        valid: true,
        assessment: possibleDuplicate,
        choice: "post",
        override: null,
      }),
    ).toBe("pending");
    expect(
      resolveReviewDecision({
        valid: true,
        assessment: possibleDuplicate,
        choice: "post",
        override: { assessmentDigest: "stale-assessment" },
      }),
    ).toBe("pending");
    expect(
      resolveReviewDecision({
        valid: true,
        assessment: possibleDuplicate,
        choice: "post",
        override: { assessmentDigest: matchingDigest },
      }),
    ).toBe("post");
  });

  it("preserves the deduplication facts that bind a Possible Duplicate override", () => {
    expect(
      toDuplicateAssessment({
        status: "possible_duplicate",
        fingerprint: "candidate-fingerprint",
        reasonCode: "same_amount_merchant_near_time",
        transactionId: "existing-transaction",
        algorithmVersion: 1,
      }),
    ).toEqual(possibleDuplicate);
  });
});
