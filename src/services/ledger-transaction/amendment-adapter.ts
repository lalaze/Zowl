import { db, type Database } from "@/db/client";
import { decimalToMinor } from "@/lib/money";
import {
  createLedgerTransactionService,
  LedgerTransactionError,
} from "@/services/ledger-transaction";
import { createTransactionService } from "@/services/transaction-service";
import {
  transactionAmendmentInputSchema,
  type TransactionAmendmentInput,
} from "@/services/transaction-service/schema";

export function createTransactionAmendmentAdapter(database: Database = db) {
  const ledger = createLedgerTransactionService(database);
  const transactionReader = createTransactionService(database);

  function amend(
    userId: string,
    transactionId: string,
    input: TransactionAmendmentInput,
  ) {
    const parsed = transactionAmendmentInputSchema.parse(input);
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

    const outcome = ledger.amendTransaction(userId, {
      transactionId,
      expectedRevisionId: parsed.expectedRevisionId,
      operationId: parsed.operationId,
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
      duplicateOverride: parsed.duplicateOverride,
      learnCategoryRule: parsed.learnCategoryRule,
    });
    if (outcome.status !== "completed") return outcome;

    const transaction = transactionReader.get(userId, transactionId);
    if (!transaction) {
      throw new LedgerTransactionError(
        "TRANSACTION_NOT_FOUND",
        "Transaction not found",
        404,
      );
    }
    return { ...outcome, transaction };
  }

  return { amend };
}

export const transactionAmendmentAdapter =
  createTransactionAmendmentAdapter();
