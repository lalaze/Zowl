import { describe, expect, it, vi } from "vitest";

import {
  automaticPostingBlocker,
  createScreenshotAutomaticPostingWorkflow,
} from "@/services/screenshot-recognition-service/automatic-posting";

function item(
  overrides: Partial<{
    status: string;
    confidence: number | null;
    validationErrors: unknown[];
    warnings: unknown[];
    duplicateKind: string | null;
    decision: string | null;
    resultTransactionId: string | null;
  }> = {},
) {
  return {
    status: "recognized",
    confidence: 0.96,
    validationErrors: [],
    warnings: [],
    duplicateKind: "unique",
    decision: "import",
    resultTransactionId: null,
    ...overrides,
  };
}

describe("automatic screenshot posting", () => {
  it("blocks incomplete, uncertain, and warned recognition results", () => {
    expect(
      automaticPostingBlocker({
        items: [item({ validationErrors: [{}] })],
      }),
    ).toBe("missing_fields");
    expect(
      automaticPostingBlocker({
        items: [item({ duplicateKind: "possible_duplicate", decision: "pending" })],
      }),
    ).toBe("duplicate_review");
    expect(
      automaticPostingBlocker({ items: [item({ confidence: 0.89 })] }),
    ).toBe("low_confidence");
    expect(
      automaticPostingBlocker({ items: [item({ warnings: ["Check"] })] }),
    ).toBe("recognition_warning");
  });

  it("allows an exact duplicate to complete as a safe skip", () => {
    expect(
      automaticPostingBlocker({
        items: [
          item({
            confidence: null,
            warnings: ["Duplicate"],
            duplicateKind: "duplicate",
            decision: "skip",
          }),
        ],
      }),
    ).toBeNull();
  });

  it("returns the posted transaction ids after safe confirmation", () => {
    const getReview = vi
      .fn()
      .mockReturnValueOnce({ items: [item()] })
      .mockReturnValueOnce({
        items: [item({ resultTransactionId: "transaction-1" })],
      });
    const confirm = vi.fn().mockReturnValue({
      jobId: "job-1",
      createdCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });
    const workflow = createScreenshotAutomaticPostingWorkflow(
      getReview,
      confirm,
    );

    expect(workflow.confirmIfSafe("user-1", "job-1")).toEqual({
      status: "completed",
      jobId: "job-1",
      createdCount: 1,
      skippedCount: 0,
      failedCount: 0,
      transactionIds: ["transaction-1"],
    });
    expect(confirm).toHaveBeenCalledWith("user-1", "job-1");
  });
});
