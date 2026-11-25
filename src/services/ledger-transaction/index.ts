import { db, type Database } from "@/db/client";
import { createAmendmentCommand } from "@/services/ledger-transaction/amendment";
import { createPostingCommand } from "@/services/ledger-transaction/posting";
import { createVoidCommand } from "@/services/ledger-transaction/voiding";

export { LedgerTransactionError } from "@/services/ledger-transaction/error";
export * from "@/services/ledger-transaction/schema";
export type {
  ConfirmationOutcome,
  TransactionRevisionOutcome,
  TransactionVoidOutcome,
} from "@/services/ledger-transaction/types";

export function createLedgerTransactionService(database: Database = db) {
  const posting = createPostingCommand(database);
  const amendment = createAmendmentCommand(database);
  const voiding = createVoidCommand(database);

  return {
    confirmPosting: posting.confirmPosting,
    amendTransaction: amendment.amendTransaction,
    voidTransaction: voiding.voidTransaction,
  };
}

export const ledgerTransactionService = createLedgerTransactionService();
