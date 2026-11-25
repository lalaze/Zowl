import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { transactionRevisions, transactions } from "@/db/schema";
import { ledgerCommandDigest } from "@/services/ledger-transaction/digest";
import { LedgerTransactionError } from "@/services/ledger-transaction/error";
import {
  transactionVoidCommandSchema,
  type TransactionVoidCommand,
} from "@/services/ledger-transaction/schema";
import type { TransactionVoidOutcome } from "@/services/ledger-transaction/types";

export function createVoidCommand(database: Database) {
  function voidTransaction(
    userId: string,
    input: TransactionVoidCommand,
  ): TransactionVoidOutcome {
    const command = transactionVoidCommandSchema.parse(input);
    const commandDigest = ledgerCommandDigest(command);

    return database.transaction((transaction) => {
      const transactionalDatabase = transaction as unknown as Database;
      const existingOperation = transactionalDatabase
        .select({
          commandDigest: transactionRevisions.commandDigest,
          kind: transactionRevisions.kind,
        })
        .from(transactionRevisions)
        .where(
          and(
            eq(transactionRevisions.userId, userId),
            eq(transactionRevisions.operationId, command.operationId),
          ),
        )
        .get();
      if (existingOperation) {
        if (
          existingOperation.commandDigest !== commandDigest ||
          existingOperation.kind !== "voiding"
        ) {
          throw new LedgerTransactionError(
            "IDEMPOTENCY_CONFLICT",
            "This void identity is bound to a different command",
            409,
          );
        }
        const revisions = transactionalDatabase
          .select({
            transactionId: transactionRevisions.transactionId,
            revisionId: transactionRevisions.id,
            revisionNumber: transactionRevisions.revisionNumber,
          })
          .from(transactionRevisions)
          .where(
            and(
              eq(transactionRevisions.userId, userId),
              eq(transactionRevisions.kind, "voiding"),
              eq(transactionRevisions.commandDigest, commandDigest),
            ),
          )
          .all();
        const revisionByTransactionId = new Map(
          revisions.map((revision) => [revision.transactionId, revision]),
        );
        return {
          status: "completed" as const,
          operationId: command.operationId,
          targets: command.targets.map((target) => {
            const revision = revisionByTransactionId.get(target.transactionId);
            if (!revision) {
              throw new LedgerTransactionError(
                "INCOMPLETE_OPERATION",
                "Void operation record is incomplete",
                409,
              );
            }
            return revision;
          }),
        };
      }

      const validatedTargets: Array<{
        current: typeof transactions.$inferSelect;
        provenance: (typeof transactionRevisions.$inferSelect)["provenanceSnapshot"];
      }> = [];
      for (const target of command.targets) {
        const current = transactionalDatabase
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.id, target.transactionId),
              eq(transactions.userId, userId),
            ),
          )
          .get();
        if (!current) {
          throw new LedgerTransactionError(
            "TRANSACTION_NOT_FOUND",
            "Transaction not found",
            404,
          );
        }
        if (current.voidedAt) {
          throw new LedgerTransactionError(
            "TRANSACTION_VOIDED",
            "Transaction already voided",
            409,
          );
        }
        if (current.currentRevisionId !== target.expectedRevisionId) {
          return {
            status: "revision_conflict" as const,
            transactionId: current.id,
            currentRevisionId: current.currentRevisionId,
          };
        }
        const revision = transactionalDatabase
          .select({ provenance: transactionRevisions.provenanceSnapshot })
          .from(transactionRevisions)
          .where(
            and(
              eq(transactionRevisions.id, target.expectedRevisionId),
              eq(transactionRevisions.transactionId, current.id),
              eq(transactionRevisions.userId, userId),
            ),
          )
          .get();
        if (!revision) {
          throw new LedgerTransactionError(
            "REVISION_NOT_FOUND",
            "Transaction revision not found",
            409,
          );
        }
        validatedTargets.push({ current, provenance: revision.provenance });
      }

      const now = new Date().toISOString();
      const outcomes = validatedTargets.map((validated, index) => {
        const { current, provenance } = validated;
        const revisionId = randomUUID();
        const revisionNumber = current.revisionNumber + 1;
        transactionalDatabase
          .insert(transactionRevisions)
          .values({
            id: revisionId,
            transactionId: current.id,
            userId,
            revisionNumber,
            kind: "voiding",
            factsSnapshot: {
              type: current.type,
              amountMinor: current.amountMinor,
              currency: current.currency,
              merchantName: current.merchantName,
              description: current.description,
              categoryId: current.categoryId,
              transactionTime: current.transactionTime,
              paymentMethod: current.paymentMethod,
            },
            provenanceSnapshot: provenance,
            actorUserId: userId,
            confirmationRowId: null,
            operationId: index === 0 ? command.operationId : null,
            commandDigest,
            duplicateAssessment: null,
            duplicateOverride: null,
            createdAt: now,
          })
          .run();
        transactionalDatabase
          .update(transactions)
          .set({
            voidedAt: now,
            currentRevisionId: revisionId,
            revisionNumber,
            updatedAt: now,
          })
          .where(
            and(
              eq(transactions.id, current.id),
              eq(transactions.userId, userId),
            ),
          )
          .run();
        return { transactionId: current.id, revisionId, revisionNumber };
      });

      return {
        status: "completed" as const,
        operationId: command.operationId,
        targets: outcomes,
      };
    });
  }

  return { voidTransaction };
}
