import { describe, expect, it } from "vitest";

import { createTransactionFingerprint } from "@/lib/fingerprint";

const base = {
  source: "manual",
  type: "expense",
  amountMinor: 3580,
  currency: "CNY",
  merchantName: "Mountain Cafe",
  transactionTime: "2026-07-15T04:30:00.000Z",
};

describe("transaction fingerprint", () => {
  it("is stable across merchant punctuation and width differences", () => {
    expect(createTransactionFingerprint(base)).toBe(
      createTransactionFingerprint({
        ...base,
        merchantName: "Mountain Cafe",
      }),
    );
  });

  it("changes when a material transaction field changes", () => {
    expect(createTransactionFingerprint(base)).not.toBe(
      createTransactionFingerprint({ ...base, amountMinor: 3581 }),
    );
    expect(createTransactionFingerprint(base)).not.toBe(
      createTransactionFingerprint({ ...base, source: "screenshot" }),
    );
  });

  it("uses the same fingerprint for equivalent offset instants", () => {
    expect(createTransactionFingerprint(base)).toBe(
      createTransactionFingerprint({
        ...base,
        transactionTime: "2026-07-15T12:30:00+08:00",
      }),
    );
  });
});
