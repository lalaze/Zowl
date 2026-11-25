import { z } from "zod";

import { db, type Database } from "@/db/client";
import { decimalToMinor } from "@/lib/money";
import {
  createLedgerTransactionService,
  LedgerTransactionError,
} from "@/services/ledger-transaction";
import { possibleDuplicateOverrideSchema } from "@/services/ledger-transaction/schema";
import { createTransactionService } from "@/services/transaction-service";
import { transactionInputSchema } from "@/services/transaction-service/schema";

export const manualPostingInputSchema = transactionInputSchema.extend({
  confirmation: z.object({
    id: z.string().trim().min(1).max(160),
    version: z.number().int().positive(),
  }),
  duplicateOverride: possibleDuplicateOverrideSchema.optional(),
});

export type ManualPostingInput = z.infer<typeof manualPostingInputSchema>;

export function createManualPostingAdapter(database: Database = db) {
  const ledger = createLedgerTransactionService(database);
  const transactionReader = createTransactionService(database);

  function confirm(userId: string, input: ManualPostingInput) {
    const parsed = manualPostingInputSchema.parse(input);
    let amountMinor: number;
    try {
      amountMinor = decimalToMinor(parsed.amount, parsed.currency);
    } catch (error) {
      throw new LedgerTransactionError(
        "INVALID_AMOUNT",
        error instanceof Error ? error.message : "Invalid amount format",
        422,
      );
    }

    const result = ledger.confirmPosting(userId, {
      identity: parsed.confirmation,
      items: [
        {
          sourceItemRef: `manual:${parsed.confirmation.id}`,
          decision: "post",
          candidate: {
            facts: {
              type: parsed.type,
              amountMinor,
              currency: parsed.currency,
              merchantName: parsed.merchantName,
              description: parsed.description,
              categoryId: parsed.categoryId,
              transactionTime: parsed.transactionTime,
              paymentMethod: parsed.paymentMethod,
            },
            provenance: { kind: "manual" },
          },
          duplicateOverride: parsed.duplicateOverride,
        },
      ],
    });

    if (result.status === "needs_review") return result;

    const outcome = result.items[0];
    const transaction = outcome?.transactionId
      ? transactionReader.get(userId, outcome.transactionId)
      : null;
    if (!outcome || !transaction) {
      throw new LedgerTransactionError(
        "CONFIRMATION_RESULT_MISSING",
        "Confirmation completed, but the transaction was not found",
        500,
      );
    }

    return {
      status: "completed" as const,
      confirmationId: result.confirmationId,
      outcome,
      transaction,
    };
  }

  return { confirm };
}

export const manualPostingAdapter = createManualPostingAdapter();
