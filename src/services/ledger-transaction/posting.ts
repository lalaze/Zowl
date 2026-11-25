import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  postingConfirmationItems,
  postingConfirmations,
  transactionRevisions,
  transactions,
} from "@/db/schema";
import { createDeduplicationService } from "@/services/deduplication-service";
import { ledgerCommandDigest } from "@/services/ledger-transaction/digest";
import { LedgerTransactionError } from "@/services/ledger-transaction/error";
import {
  duplicateAssessmentDigest,
  resolveReviewDecision,
  toDuplicateAssessment,
} from "@/services/ledger-transaction/review-decision";
import {
  postingConfirmationCommandSchema,
  type PostingConfirmationCommand,
} from "@/services/ledger-transaction/schema";
import { assertSourceReference } from "@/services/ledger-transaction/source-reference";
import type {
  ConfirmationOutcome,
  ConfirmationOutcomeItem,
  NeedsReviewItem,
} from "@/services/ledger-transaction/types";
import {
  assertLedgerCategory,
  platformTransactionId,
  transactionSource,
} from "@/services/ledger-transaction/validation";

class NeedsReviewSignal extends Error {
  constructor(readonly items: NeedsReviewItem[]) {
    super("Posting Confirmation needs review");
    this.name = "NeedsReviewSignal";
  }
}

export function createPostingCommand(database: Database) {
  function confirmPosting(
    userId: string,
    input: PostingConfirmationCommand,
  ): ConfirmationOutcome {
    const command = postingConfirmationCommandSchema.parse(input);
    const commandDigest = ledgerCommandDigest({
      version: command.identity.version,
      items: command.items,
    });

    try {
      return database.transaction((transaction) => {
        const transactionalDatabase = transaction as unknown as Database;
      const existing = transactionalDatabase
        .select({
          id: postingConfirmations.id,
          commandDigest: postingConfirmations.commandDigest,
        })
        .from(postingConfirmations)
        .where(
          and(
            eq(postingConfirmations.userId, userId),
            eq(postingConfirmations.confirmationId, command.identity.id),
          ),
        )
        .get();
      if (existing) {
        if (existing.commandDigest !== commandDigest) {
          throw new LedgerTransactionError(
            "IDEMPOTENCY_CONFLICT",
            "This confirmation identity is bound to different candidates or decisions",
            409,
          );
        }
        const items = transactionalDatabase
          .select({
            sourceItemRef: postingConfirmationItems.sourceItemRef,
            outcome: postingConfirmationItems.outcome,
            resultTransactionId: postingConfirmationItems.resultTransactionId,
            matchedTransactionId: postingConfirmationItems.matchedTransactionId,
            revisionId: postingConfirmationItems.resultRevisionId,
          })
          .from(postingConfirmationItems)
          .where(
            eq(postingConfirmationItems.confirmationRowId, existing.id),
          )
          .orderBy(asc(postingConfirmationItems.ordinal))
          .all()
          .map(({ resultTransactionId, matchedTransactionId, ...item }) => ({
            ...item,
            transactionId:
              item.outcome === "duplicate"
                ? matchedTransactionId
                : resultTransactionId,
          }));
        return {
          status: "completed" as const,
          confirmationId: command.identity.id,
          items,
        };
      }

      const now = new Date().toISOString();
      const confirmationRowId = randomUUID();
      transactionalDatabase
        .insert(postingConfirmations)
        .values({
          id: confirmationRowId,
          userId,
          confirmationId: command.identity.id,
          version: command.identity.version,
          commandDigest,
          status: "committing",
          createdAt: now,
        })
        .run();

      const deduplication = createDeduplicationService(transactionalDatabase);
      const outcomes: ConfirmationOutcomeItem[] = [];
      const cohortSourceByTransactionId = new Map<string, string>();
      for (const [index, item] of command.items.entries()) {
        assertSourceReference(transactionalDatabase, userId, item);
        const { facts, provenance } = item.candidate;
        try {
          assertLedgerCategory(
            transactionalDatabase,
            userId,
            facts.categoryId,
            facts.type,
          );
        } catch (error) {
          if (
            error instanceof LedgerTransactionError &&
            error.code === "INVALID_CATEGORY"
          ) {
            throw new NeedsReviewSignal([
              {
                sourceItemRef: item.sourceItemRef,
                assessment: null,
                assessmentDigest: null,
                validationIssues: [
                  { code: "invalid_category", message: error.message },
                ],
              },
            ]);
          }
          throw error;
        }
        const source = transactionSource(provenance);
        const assessment = deduplication.check(userId, {
          type: facts.type,
          amountMinor: facts.amountMinor,
          currency: facts.currency,
          merchantName: facts.merchantName,
          description: facts.description,
          transactionTime: facts.transactionTime,
          source,
          platformTransactionId: platformTransactionId(provenance),
        });
        const matchedCandidateRef = assessment.transactionId
          ? (cohortSourceByTransactionId.get(assessment.transactionId) ?? null)
          : null;
        const assessmentSnapshot = {
          ...toDuplicateAssessment(assessment),
          // A cohort transaction only exists inside this transaction until the
          // whole confirmation commits. Candidate refs remain stable across a
          // needs-review rollback; the temporary transaction id does not.
          matchedTransactionId: matchedCandidateRef
            ? null
            : assessment.transactionId,
          matchedCandidateRef,
        };
        const reviewDecision = resolveReviewDecision({
          valid: true,
          assessment: assessmentSnapshot,
          choice: item.decision,
          override: item.duplicateOverride ?? null,
        });
        if (reviewDecision === "pending") {
          throw new NeedsReviewSignal([
            {
              sourceItemRef: item.sourceItemRef,
              assessment: assessmentSnapshot,
              assessmentDigest: duplicateAssessmentDigest(assessmentSnapshot),
              validationIssues: [],
            },
          ]);
        }

        if (reviewDecision === "skipped") {
          transactionalDatabase
            .insert(postingConfirmationItems)
            .values({
              id: randomUUID(),
              confirmationRowId,
              userId,
              ordinal: index + 1,
              sourceKind: provenance.kind,
              sourceItemRef: item.sourceItemRef,
              candidateDigest: ledgerCommandDigest(item.candidate),
              decision: item.decision,
              assessmentStatus: assessment.status,
              reasonCode: assessmentSnapshot.reasonCode,
              matchedTransactionId: assessmentSnapshot.matchedTransactionId,
              matchedCandidateRef: assessmentSnapshot.matchedCandidateRef,
              fingerprint: assessment.fingerprint,
              algorithmVersion: assessmentSnapshot.algorithmVersion,
              overrideDigest: null,
              outcome: "skipped",
              resultTransactionId: null,
              resultRevisionId: null,
              createdAt: now,
            })
            .run();
          outcomes.push({
            sourceItemRef: item.sourceItemRef,
            outcome: "skipped",
            transactionId: null,
            revisionId: null,
          });
          continue;
        }

        if (reviewDecision === "duplicate") {
          transactionalDatabase
            .insert(postingConfirmationItems)
            .values({
              id: randomUUID(),
              confirmationRowId,
              userId,
              ordinal: index + 1,
              sourceKind: provenance.kind,
              sourceItemRef: item.sourceItemRef,
              candidateDigest: ledgerCommandDigest(item.candidate),
              decision: item.decision,
              assessmentStatus: assessment.status,
              reasonCode: assessmentSnapshot.reasonCode,
              matchedTransactionId: assessmentSnapshot.matchedTransactionId,
              matchedCandidateRef: assessmentSnapshot.matchedCandidateRef,
              fingerprint: assessment.fingerprint,
              algorithmVersion: assessmentSnapshot.algorithmVersion,
              overrideDigest: null,
              outcome: "duplicate",
              resultTransactionId: null,
              resultRevisionId: null,
              createdAt: now,
            })
            .run();
          outcomes.push({
            sourceItemRef: item.sourceItemRef,
            outcome: "duplicate",
            transactionId: assessment.transactionId,
            revisionId: null,
          });
          continue;
        }

        const transactionId = randomUUID();
        const revisionId = randomUUID();
        transactionalDatabase
          .insert(transactions)
          .values({
            id: transactionId,
            userId,
            ...facts,
            createdAt: now,
            updatedAt: now,
            source,
            platformTransactionId: platformTransactionId(provenance),
            status:
              provenance.kind === "manual" ? null : provenance.platformStatus,
            originalFileId:
              provenance.kind === "file_import" ||
              provenance.kind === "screenshot_recognition"
                ? provenance.fileId
                : null,
            importBatchId:
              provenance.kind === "file_import" ? provenance.batchId : null,
            fingerprint: assessment.fingerprint,
            duplicateStatus: assessment.status,
            recognitionConfidence:
              provenance.kind === "screenshot_recognition" ||
              provenance.kind === "notification_capture" ||
              provenance.kind === "payment_page_capture"
                ? provenance.confidenceBasisPoints
                : null,
            needsReview: false,
            currentRevisionId: revisionId,
            revisionNumber: 1,
            voidedAt: null,
          })
          .run();
        transactionalDatabase
          .insert(transactionRevisions)
          .values({
            id: revisionId,
            transactionId,
            userId,
            revisionNumber: 1,
            kind: "posting",
            factsSnapshot: facts,
            provenanceSnapshot: provenance,
            actorUserId: userId,
            confirmationRowId,
            operationId: null,
            commandDigest,
            duplicateAssessment: assessmentSnapshot,
            duplicateOverride: item.duplicateOverride ?? null,
            createdAt: now,
          })
          .run();
        transactionalDatabase
          .insert(postingConfirmationItems)
          .values({
            id: randomUUID(),
            confirmationRowId,
            userId,
            ordinal: index + 1,
            sourceKind: provenance.kind,
            sourceItemRef: item.sourceItemRef,
            candidateDigest: ledgerCommandDigest(item.candidate),
            decision: item.decision,
            assessmentStatus: assessment.status,
            reasonCode: assessmentSnapshot.reasonCode,
            matchedTransactionId: assessmentSnapshot.matchedTransactionId,
            matchedCandidateRef: assessmentSnapshot.matchedCandidateRef,
            fingerprint: assessment.fingerprint,
            algorithmVersion: assessmentSnapshot.algorithmVersion,
            overrideDigest: item.duplicateOverride?.assessmentDigest ?? null,
            outcome: "posted",
            resultTransactionId: transactionId,
            resultRevisionId: revisionId,
            createdAt: now,
          })
          .run();
        outcomes.push({
          sourceItemRef: item.sourceItemRef,
          outcome: "posted",
          transactionId,
          revisionId,
        });
        cohortSourceByTransactionId.set(transactionId, item.sourceItemRef);
      }

      transactionalDatabase
        .update(postingConfirmations)
        .set({
          status: "completed",
          postedCount: outcomes.filter((item) => item.outcome === "posted").length,
          duplicateCount: outcomes.filter((item) => item.outcome === "duplicate").length,
          skippedCount: outcomes.filter((item) => item.outcome === "skipped").length,
          completedAt: now,
        })
        .where(eq(postingConfirmations.id, confirmationRowId))
        .run();

        return {
          status: "completed" as const,
          confirmationId: command.identity.id,
          items: outcomes,
        };
      });
    } catch (error) {
      if (error instanceof NeedsReviewSignal) {
        return {
          status: "needs_review",
          confirmationId: command.identity.id,
          items: error.items,
        };
      }
      throw error;
    }
  }

  return { confirmPosting };
}
