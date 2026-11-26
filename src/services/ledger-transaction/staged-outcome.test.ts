import { describe, expect, it } from "vitest";

import {
  stagedCandidateFacts,
  stagedDuplicateOverride,
  stagedOutcomeColumns,
  stagedOutcomeResultCode,
} from "@/services/ledger-transaction/staged-outcome";

describe("staged-outcome helpers", () => {
  it("extracts canonical ledger facts without extra staged properties", () => {
    const staged = {
      type: "expense" as const,
      amountMinor: 1500,
      currency: "CNY",
      merchantName: "Cedar Tea House",
      description: "Green tea",
      categoryId: "food",
      transactionTime: "2026-07-16T01:00:00.000Z",
      paymentMethod: "Alipay",
      extraField: "ignored",
    };

    expect(stagedCandidateFacts(staged)).toEqual({
      type: "expense",
      amountMinor: 1500,
      currency: "CNY",
      merchantName: "Cedar Tea House",
      description: "Green tea",
      categoryId: "food",
      transactionTime: "2026-07-16T01:00:00.000Z",
      paymentMethod: "Alipay",
    });
  });

  it("maps duplicate override only for import_anyway with an assessment digest", () => {
    expect(
      stagedDuplicateOverride({
        decision: "import_anyway",
        duplicateAssessmentDigest: "digest-1",
      }),
    ).toEqual({ assessmentDigest: "digest-1" });
    expect(
      stagedDuplicateOverride({
        decision: "import_anyway",
        duplicateAssessmentDigest: null,
      }),
    ).toBeUndefined();
    expect(
      stagedDuplicateOverride({
        decision: "import",
        duplicateAssessmentDigest: "digest-1",
      }),
    ).toBeUndefined();
  });

  it("maps every confirmation outcome to its staged result code and columns", () => {
    const now = "2026-07-16T04:00:00.000Z";

    expect(
      stagedOutcomeColumns(
        {
          sourceItemRef: "item-1",
          outcome: "posted",
          transactionId: "tx-1",
          revisionId: "rev-1",
        },
        {
          duplicateStatus: "unique",
          duplicateTransactionId: null,
          decision: "import",
          validationErrors: [],
        },
        now,
      ),
    ).toEqual({
      resultTransactionId: "tx-1",
      resultCode: "IMPORTED",
      duplicateStatus: "unique",
      duplicateTransactionId: null,
      decision: "import",
      updatedAt: now,
    });

    expect(
      stagedOutcomeColumns(
        {
          sourceItemRef: "item-2",
          outcome: "duplicate",
          transactionId: "tx-existing",
          revisionId: null,
        },
        {
          duplicateStatus: "unique",
          duplicateTransactionId: null,
          decision: "import",
          validationErrors: [],
        },
        now,
      ),
    ).toEqual({
      resultTransactionId: null,
      resultCode: "SKIPPED_DUPLICATE",
      duplicateStatus: "duplicate",
      duplicateTransactionId: "tx-existing",
      decision: "skip",
      updatedAt: now,
    });

    expect(
      stagedOutcomeResultCode(
        {
          sourceItemRef: "item-3",
          outcome: "skipped",
          transactionId: null,
          revisionId: null,
        },
        {
          duplicateStatus: "possible_duplicate",
          validationErrors: [],
        },
      ),
    ).toBe("SKIPPED_POSSIBLE_DUPLICATE");

    expect(
      stagedOutcomeResultCode(
        {
          sourceItemRef: "item-4",
          outcome: "skipped",
          transactionId: null,
          revisionId: null,
        },
        {
          duplicateStatus: "unique",
          validationErrors: [{ code: "REQUIRED" }],
        },
      ),
    ).toBe("SKIPPED_INVALID");

    expect(
      stagedOutcomeResultCode(
        {
          sourceItemRef: "item-5",
          outcome: "skipped",
          transactionId: null,
          revisionId: null,
        },
        {
          duplicateStatus: "unique",
          validationErrors: [],
        },
      ),
    ).toBe("SKIPPED_BY_USER");
  });
});
