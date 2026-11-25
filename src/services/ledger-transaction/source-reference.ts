import { captureSourceKind } from "@/lib/capture-source";
import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  importBatches,
  importItems,
  notificationCaptures,
  recognitionItems,
  recognitionJobs,
} from "@/db/schema";
import { ledgerCommandDigest } from "@/services/ledger-transaction/digest";
import { LedgerTransactionError } from "@/services/ledger-transaction/error";
import {
  ledgerFactsSchema,
  type PostingConfirmationCommand,
} from "@/services/ledger-transaction/schema";

function invalidSourceReference(message: string): never {
  throw new LedgerTransactionError("INVALID_SOURCE_REFERENCE", message, 409);
}

export function assertSourceReference(
  database: Database,
  userId: string,
  item: PostingConfirmationCommand["items"][number],
) {
  const provenance = item.candidate.provenance;
  if (provenance.kind === "manual") return;

  if (provenance.kind === "file_import") {
    const storedItem = database
      .select()
      .from(importItems)
      .where(
        and(
          eq(importItems.id, provenance.importItemId),
          eq(importItems.batchId, provenance.batchId),
          eq(importItems.userId, userId),
        ),
      )
      .get();
    const batch = database
      .select()
      .from(importBatches)
      .where(
        and(
          eq(importBatches.id, provenance.batchId),
          eq(importBatches.userId, userId),
        ),
      )
      .get();
    if (
      !storedItem ||
      !batch ||
      item.sourceItemRef !== storedItem.id ||
      batch.fileId !== provenance.fileId ||
      batch.source !== provenance.platform ||
      batch.status !== "reviewing"
    ) {
      invalidSourceReference("Import source reference is missing, expired, or belongs to another user");
    }

    const normalized = storedItem.normalizedData as Record<string, unknown> | null;
    const facts = ledgerFactsSchema.safeParse(
      normalized
        ? {
            type: normalized.type,
            amountMinor: normalized.amountMinor,
            currency: normalized.currency,
            merchantName: normalized.merchantName,
            description: normalized.description,
            categoryId: normalized.categoryId,
            transactionTime: normalized.transactionTime,
            paymentMethod: normalized.paymentMethod,
          }
        : null,
    );
    if (!facts.success) {
      invalidSourceReference("Import item canonical ledger fields are stale");
    }

    const expectedCandidate = {
      facts: facts.data,
      provenance: {
        kind: "file_import" as const,
        importItemId: storedItem.id,
        batchId: batch.id,
        fileId: batch.fileId,
        platform: batch.source,
        platformTransactionId:
          typeof normalized?.platformTransactionId === "string"
            ? normalized.platformTransactionId
            : null,
        platformStatus:
          typeof normalized?.status === "string" ? normalized.status : null,
      },
    };
    const expectedDecision = storedItem.decision === "skip" ? "skip" : "post";
    if (
      item.decision !== expectedDecision ||
      ledgerCommandDigest(expectedCandidate) !== ledgerCommandDigest(item.candidate)
    ) {
      invalidSourceReference("Import item changed before final confirmation");
    }
    return;
  }

  if (provenance.kind === "notification_capture" || provenance.kind === "payment_page_capture") {
    const storedCapture = database
      .select()
      .from(notificationCaptures)
      .where(
        and(
          eq(notificationCaptures.id, provenance.captureId),
          eq(notificationCaptures.userId, userId),
        ),
      )
      .get();
    if (
      !storedCapture ||
      item.sourceItemRef !== storedCapture.id ||
      storedCapture.status !== "reviewing"
    ) {
      invalidSourceReference("Notification candidate is missing, expired, or belongs to another user");
    }
    const facts = ledgerFactsSchema.safeParse(storedCapture.normalizedData);
    if (!facts.success) {
      invalidSourceReference("Notification candidate canonical ledger fields are stale");
    }
    const expectedCandidate = {
      facts: facts.data,
      provenance: {
        kind: captureSourceKind(storedCapture.parserId),
        captureId: storedCapture.id,
        platform: storedCapture.platform,
        sourcePackage: storedCapture.sourcePackage,
        parserId: storedCapture.parserId,
        parserVersion: storedCapture.parserVersion,
        evidenceDigest: storedCapture.evidenceDigest,
        platformTransactionId: null,
        platformStatus: "success" as const,
        confidenceBasisPoints: storedCapture.confidenceBasisPoints,
      },
    };
    const expectedDecision =
      storedCapture.decision === "skip" ? "skip" : "post";
    if (
      item.decision !== expectedDecision ||
      ledgerCommandDigest(expectedCandidate) !==
        ledgerCommandDigest(item.candidate)
    ) {
      invalidSourceReference("Notification candidate changed before final confirmation");
    }
    return;
  }

  const storedItem = database
    .select()
    .from(recognitionItems)
    .where(
      and(
        eq(recognitionItems.id, provenance.recognitionItemId),
        eq(recognitionItems.jobId, provenance.jobId),
        eq(recognitionItems.userId, userId),
      ),
    )
    .get();
  const job = database
    .select()
    .from(recognitionJobs)
    .where(
      and(
        eq(recognitionJobs.id, provenance.jobId),
        eq(recognitionJobs.userId, userId),
      ),
    )
    .get();
  if (
    !storedItem ||
    !job ||
    item.sourceItemRef !== storedItem.id ||
    storedItem.fileId !== provenance.fileId ||
    job.providerId !== provenance.providerId ||
    job.status !== "reviewing" ||
    storedItem.status !== "recognized"
  ) {
    invalidSourceReference("Screenshot source reference is missing, expired, or belongs to another user");
  }
  const normalized = storedItem.normalizedData as Record<string, unknown> | null;
  const facts = ledgerFactsSchema.safeParse(
    normalized
      ? {
          type: normalized.type,
          amountMinor: normalized.amountMinor,
          currency: normalized.currency,
          merchantName: normalized.merchantName,
          description: normalized.description,
          categoryId: normalized.categoryId,
          transactionTime: normalized.transactionTime,
          paymentMethod: normalized.paymentMethod,
        }
      : null,
  );
  if (!facts.success) {
    invalidSourceReference("Screenshot item canonical ledger fields are stale");
  }
  const confidence =
    typeof normalized?.confidence === "number"
      ? Math.round(normalized.confidence * 10_000)
      : null;
  const expectedCandidate = {
    facts: facts.data,
    provenance: {
      kind: "screenshot_recognition" as const,
      recognitionItemId: storedItem.id,
      jobId: job.id,
      fileId: storedItem.fileId,
      providerId: job.providerId,
      platformTransactionId:
        typeof normalized?.platformTransactionId === "string"
          ? normalized.platformTransactionId
          : null,
      platformStatus:
        typeof normalized?.transactionStatus === "string"
          ? normalized.transactionStatus
          : null,
      confidenceBasisPoints: confidence,
    },
  };
  const expectedDecision = storedItem.decision === "skip" ? "skip" : "post";
  if (
    item.decision !== expectedDecision ||
    ledgerCommandDigest(expectedCandidate) !== ledgerCommandDigest(item.candidate)
  ) {
    invalidSourceReference("Screenshot item changed before final confirmation");
  }
}
