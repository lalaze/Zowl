import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  merchantCategoryRules,
  transactionRevisions,
  transactions,
} from "@/db/schema";
import { normalizeMerchantName } from "@/lib/merchant";
import { createDeduplicationService } from "@/services/deduplication-service";
import { ledgerCommandDigest } from "@/services/ledger-transaction/digest";
import { LedgerTransactionError } from "@/services/ledger-transaction/error";
import {
  duplicateAssessmentDigest,
  resolveReviewDecision,
  toDuplicateAssessment,
} from "@/services/ledger-transaction/review-decision";
import {
  transactionAmendmentCommandSchema,
  type TransactionAmendmentCommand,
} from "@/services/ledger-transaction/schema";
import type { TransactionRevisionOutcome } from "@/services/ledger-transaction/types";
import { assertLedgerCategory } from "@/services/ledger-transaction/validation";

export function createAmendmentCommand(database: Database) {
  function amendTransaction(
    userId: string,
    input: TransactionAmendmentCommand,
  ): TransactionRevisionOutcome {
    const command = transactionAmendmentCommandSchema.parse(input);
    const commandDigest = ledgerCommandDigest(command);

    return database.transaction((transaction) => {
      const transactionalDatabase = transaction as unknown as Database;
      const existingOperation = transactionalDatabase
        .select({
          transactionId: transactionRevisions.transactionId,
          revisionId: transactionRevisions.id,
          revisionNumber: transactionRevisions.revisionNumber,
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
          existingOperation.kind !== "amendment"
        ) {
          throw new LedgerTransactionError(
            "IDEMPOTENCY_CONFLICT",
            "This amendment identity is bound to a different command",
            409,
          );
        }
        return {
          status: "completed" as const,
          transactionId: existingOperation.transactionId,
          revisionId: existingOperation.revisionId,
          revisionNumber: existingOperation.revisionNumber,
        };
      }

      const current = transactionalDatabase
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.id, command.transactionId),
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
          "Voided transactions cannot be amended",
          409,
        );
      }
      if (current.currentRevisionId !== command.expectedRevisionId) {
        return {
          status: "revision_conflict" as const,
          transactionId: current.id,
          currentRevisionId: current.currentRevisionId,
        };
      }

      const currentRevision = transactionalDatabase
        .select({
          provenance: transactionRevisions.provenanceSnapshot,
        })
        .from(transactionRevisions)
        .where(
          and(
            eq(transactionRevisions.id, command.expectedRevisionId),
            eq(transactionRevisions.transactionId, current.id),
            eq(transactionRevisions.userId, userId),
          ),
        )
        .get();
      if (!currentRevision) {
        throw new LedgerTransactionError(
          "REVISION_NOT_FOUND",
          "Transaction revision not found",
          409,
        );
      }

      assertLedgerCategory(
        transactionalDatabase,
        userId,
        command.facts.categoryId,
        command.facts.type,
      );
      const assessment = createDeduplicationService(
        transactionalDatabase,
      ).check(
        userId,
        {
          type: command.facts.type,
          amountMinor: command.facts.amountMinor,
          currency: command.facts.currency,
          merchantName: command.facts.merchantName,
          description: command.facts.description,
          transactionTime: command.facts.transactionTime,
          source: current.source,
          platformTransactionId: current.platformTransactionId,
        },
        { excludeTransactionId: current.id },
      );
      const assessmentSnapshot = toDuplicateAssessment(assessment);
      const reviewDecision = resolveReviewDecision({
        valid: true,
        assessment: assessmentSnapshot,
        choice: "post",
        override: command.duplicateOverride ?? null,
      });
      if (reviewDecision === "pending") {
        return {
          status: "needs_review" as const,
          transactionId: current.id,
          assessment: assessmentSnapshot,
          assessmentDigest: duplicateAssessmentDigest(assessmentSnapshot),
        };
      }
      if (reviewDecision === "duplicate") {
        throw new LedgerTransactionError(
          "DUPLICATE_TRANSACTION",
          assessment.reason ?? "Amended transaction requires duplicate review",
          409,
        );
      }

      const now = new Date().toISOString();
      const revisionId = randomUUID();
      const revisionNumber = current.revisionNumber + 1;
      const normalizedMerchant = normalizeMerchantName(
        command.facts.merchantName,
      );
      if (
        command.learnCategoryRule &&
        (!command.facts.categoryId || !normalizedMerchant)
      ) {
        throw new LedgerTransactionError(
          "INVALID_CATEGORY_RULE",
          "Remembering a category requires a nonempty merchant and category",
          422,
        );
      }
      transactionalDatabase
        .insert(transactionRevisions)
        .values({
          id: revisionId,
          transactionId: current.id,
          userId,
          revisionNumber,
          kind: "amendment",
          factsSnapshot: command.facts,
          provenanceSnapshot: currentRevision.provenance,
          actorUserId: userId,
          confirmationRowId: null,
          operationId: command.operationId,
          commandDigest,
          duplicateAssessment: assessmentSnapshot,
          duplicateOverride: command.duplicateOverride ?? null,
          createdAt: now,
        })
        .run();
      transactionalDatabase
        .update(transactions)
        .set({
          ...command.facts,
          fingerprint: assessment.fingerprint,
          duplicateStatus: assessment.status,
          needsReview: false,
          currentRevisionId: revisionId,
          revisionNumber,
          updatedAt: now,
        })
        .where(
          and(eq(transactions.id, current.id), eq(transactions.userId, userId)),
        )
        .run();
      if (
        command.learnCategoryRule &&
        command.facts.categoryId &&
        normalizedMerchant
      ) {
        transactionalDatabase
          .insert(merchantCategoryRules)
          .values({
            id: randomUUID(),
            userId,
            categoryId: command.facts.categoryId,
            normalizedMerchantName: normalizedMerchant,
            matchType: "exact",
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              merchantCategoryRules.userId,
              merchantCategoryRules.normalizedMerchantName,
              merchantCategoryRules.matchType,
            ],
            set: {
              categoryId: command.facts.categoryId,
              updatedAt: now,
            },
          })
          .run();
      }

      return {
        status: "completed" as const,
        transactionId: current.id,
        revisionId,
        revisionNumber,
      };
    });
  }

  return { amendTransaction };
}
