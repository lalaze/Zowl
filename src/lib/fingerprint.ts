import { createHash } from "node:crypto";

import { normalizeMerchantName } from "@/lib/merchant";
import { normalizeTransactionTime } from "@/lib/transaction-time";

type FingerprintInput = {
  source: string;
  type: string;
  amountMinor: number;
  currency: string;
  merchantName?: string | null;
  transactionTime: string;
};

export function createTransactionFingerprint(input: FingerprintInput) {
  const material = [
    input.source,
    input.type,
    String(input.amountMinor),
    input.currency.toUpperCase(),
    normalizeMerchantName(input.merchantName),
    normalizeTransactionTime(input.transactionTime),
  ].join("|");

  return createHash("sha256").update(material).digest("hex");
}
