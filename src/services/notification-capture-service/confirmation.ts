import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { notificationCaptures } from "@/db/schema";
import { captureSourceKind } from "@/lib/capture-source";
import { createCategorizationService } from "@/services/categorization-service";
import { createLedgerTransactionService } from "@/services/ledger-transaction";
import { ledgerFactsSchema } from "@/services/ledger-transaction/schema";
import { assertLedgerCategory } from "@/services/ledger-transaction/validation";
import { NotificationCaptureServiceError } from "@/services/notification-capture-service/error";
import {
  completedResult,
  duplicateColumns,
  getCaptureRow,
  notFound,
  parseFacts,
  project,
  resolvedFieldOrigins,
  type DeduplicateCapture,
} from "@/services/notification-capture-service/projection";
import {
  notificationCaptureBulkConfirmSchema,
  notificationCaptureConfirmSchema,
  notificationCaptureQuickConfirmSchema,
} from "@/services/notification-capture-service/schema";

export function createNotificationCaptureConfirmation(
  database: Database,
  deduplicate: DeduplicateCapture,
) {
  function confirmParsedOn(
    source: Database,
    userId: string,
    captureId: string,
    input: unknown,
  ) {
    const parsed = notificationCaptureConfirmSchema.parse(input);
    const current = getCaptureRow(source, userId, captureId);
    if (!current) notFound();
    if (current.status === "completed") return completedResult(current);

    const facts = parseFacts(current.normalizedData);
    const decision =
      parsed.decision === "skip"
        ? ("skip" as const)
        : current.duplicateStatus === "possible_duplicate"
          ? ("import_anyway" as const)
          : ("import" as const);
    source
      .update(notificationCaptures)
      .set({ decision, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(notificationCaptures.id, captureId),
          eq(notificationCaptures.userId, userId),
          eq(notificationCaptures.status, "reviewing"),
        ),
      )
      .run();

    const confirmation = createLedgerTransactionService(source).confirmPosting(
      userId,
      {
        identity: {
          id: `notification-capture:${captureId}`,
          version: current.confirmationVersion,
        },
        items: [
          {
            sourceItemRef: captureId,
            decision: parsed.decision,
            candidate: {
              facts,
              provenance: {
                kind: captureSourceKind(current.parserId),
                captureId,
                platform: current.platform,
                sourcePackage: current.sourcePackage,
                parserId: current.parserId,
                parserVersion: current.parserVersion,
                evidenceDigest: current.evidenceDigest,
                platformTransactionId: null,
                platformStatus: "success",
                confidenceBasisPoints: current.confidenceBasisPoints,
              },
            },
            duplicateOverride:
              parsed.decision === "post" && parsed.assessmentDigest
                ? { assessmentDigest: parsed.assessmentDigest }
                : undefined,
          },
        ],
      },
    );

    if (confirmation.status === "needs_review") {
      const review = confirmation.items[0];
      source
        .update(notificationCaptures)
        .set({
          duplicateStatus: review?.assessment?.status ?? current.duplicateStatus,
          duplicateTransactionId:
            review?.assessment?.matchedTransactionId ??
            current.duplicateTransactionId,
          duplicateAssessmentDigest:
            review?.assessmentDigest ?? current.duplicateAssessmentDigest,
          decision: "pending",
          confirmationVersion: current.confirmationVersion + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(notificationCaptures.id, captureId),
            eq(notificationCaptures.userId, userId),
          ),
        )
        .run();
      return {
        status: "needs_review" as const,
        capture: project(getCaptureRow(source, userId, captureId)!),
        review,
      };
    }

    const outcome = confirmation.items[0];
    if (!outcome) {
      throw new NotificationCaptureServiceError(
        "NOTIFICATION_CAPTURE_RESULT_MISSING",
        "Confirmation completed, but the notification candidate result was not found",
        500,
      );
    }
    const now = new Date().toISOString();
    const resultCode =
      outcome.outcome === "posted"
        ? "IMPORTED"
        : outcome.outcome === "duplicate"
          ? "SKIPPED_DUPLICATE"
          : "SKIPPED_BY_USER";
    source
      .update(notificationCaptures)
      .set({
        status: "completed",
        decision: outcome.outcome === "duplicate" ? "skip" : decision,
        duplicateStatus:
          outcome.outcome === "duplicate"
            ? "duplicate"
            : current.duplicateStatus,
        duplicateTransactionId:
          outcome.outcome === "duplicate"
            ? outcome.transactionId
            : current.duplicateTransactionId,
        resultTransactionId:
          outcome.outcome === "posted" ? outcome.transactionId : null,
        resultCode,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationCaptures.id, captureId),
          eq(notificationCaptures.userId, userId),
        ),
      )
      .run();
    return {
      status: "completed" as const,
      capture: project(getCaptureRow(source, userId, captureId)!),
      outcome,
    };
  }

  function confirm(userId: string, captureId: string, rawInput: unknown) {
    return confirmParsedOn(database, userId, captureId, rawInput);
  }

  function confirmMany(userId: string, rawInput: unknown) {
    const input = notificationCaptureBulkConfirmSchema.parse(rawInput);
    return database.transaction((tx) => {
      const source = tx as unknown as Database;
      const outcomes = input.items.map((item) => {
        const current = getCaptureRow(source, userId, item.id);
        if (!current) notFound();
        if (
          current.confirmationVersion !== item.version ||
          (current.status !== "completed" &&
            deduplicate(
              userId,
              current.platform,
              parseFacts(current.normalizedData),
            ).status !== "unique")
        ) {
          throw new NotificationCaptureServiceError(
            "BATCH_REVIEW_REQUIRED",
            "A selected candidate changed or needs duplicate review. Nothing in this batch was posted",
            409,
          );
        }
        const result = confirmParsedOn(source, userId, item.id, {
          decision: "post",
        });
        if (result.status !== "completed") {
          throw new NotificationCaptureServiceError(
            "BATCH_REVIEW_REQUIRED",
            "A selected candidate now needs duplicate review. Nothing in this batch was posted",
            409,
          );
        }
        return result;
      });
      return { status: "completed" as const, outcomes };
    });
  }

  function quickConfirm(userId: string, captureId: string, rawInput: unknown) {
    const input = notificationCaptureQuickConfirmSchema.parse(rawInput);
    return database.transaction((transaction) => {
      const source = transaction as unknown as Database;
      const current = getCaptureRow(source, userId, captureId);
      if (!current) notFound();
      if (current.status === "completed") return completedResult(current);

      const currentFacts = parseFacts(current.normalizedData);
      const merchantName = input.merchantName ?? currentFacts.merchantName;
      if (!merchantName) {
        throw new NotificationCaptureServiceError(
          "NOTIFICATION_CAPTURE_MERCHANT_REQUIRED",
          "Enter a merchant before posting",
          422,
        );
      }
      const categoryId = createCategorizationService(source).suggest({
        userId,
        type: "expense",
        merchantName,
        description: currentFacts.description,
      }).categoryId;
      const facts = ledgerFactsSchema.parse({
        ...currentFacts,
        merchantName,
        categoryId,
      });
      const previousOrigins = resolvedFieldOrigins(current);
      const duplicate = deduplicate(userId, current.platform, facts, source);
      source
        .update(notificationCaptures)
        .set({
          normalizedData: facts,
          fieldOrigins: {
            ...previousOrigins,
            merchantName: input.merchantName
              ? "quick_input"
              : previousOrigins.merchantName,
            categoryId: "categorization_rule",
          },
          validationErrors: [],
          ...duplicateColumns(duplicate),
          decision: "pending",
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(notificationCaptures.id, captureId),
            eq(notificationCaptures.userId, userId),
            eq(notificationCaptures.status, "reviewing"),
          ),
        )
        .run();

      return confirmParsedOn(source, userId, captureId, { decision: "post" });
    });
  }

  function confirmBillEnrichment(
    userId: string,
    captureId: string,
    input: {
      expectedConfirmationVersion: number;
      values: {
        merchantName: string | null;
        description: string | null;
        paymentMethod: string | null;
        categoryId: string | null;
      };
      adoptedFields: Array<
        "merchantName" | "description" | "paymentMethod" | "categoryId"
      >;
    },
  ) {
    const current = getCaptureRow(database, userId, captureId);
    if (
      !current ||
      current.status !== "reviewing" ||
      current.confirmationVersion !== input.expectedConfirmationVersion
    ) {
      throw new NotificationCaptureServiceError(
        "NOTIFICATION_CAPTURE_TARGET_CHANGED",
        "Notification candidate changed. Review the statement again",
        409,
      );
    }
    assertLedgerCategory(
      database,
      userId,
      input.values.categoryId,
      "expense",
    );
    const currentFacts = parseFacts(current.normalizedData);
    const facts = ledgerFactsSchema.parse({
      ...currentFacts,
      ...input.values,
    });
    const previousOrigins = resolvedFieldOrigins(current);
    const adopted = new Set(input.adoptedFields);
    const duplicate = deduplicate(userId, current.platform, facts);
    database
      .update(notificationCaptures)
      .set({
        normalizedData: facts,
        fieldOrigins: {
          merchantName: adopted.has("merchantName")
            ? "bill_enrichment"
            : previousOrigins.merchantName,
          description: adopted.has("description")
            ? "bill_enrichment"
            : previousOrigins.description,
          paymentMethod: adopted.has("paymentMethod")
            ? "bill_enrichment"
            : previousOrigins.paymentMethod,
          categoryId: adopted.has("categoryId")
            ? "bill_enrichment"
            : previousOrigins.categoryId,
        },
        validationErrors: [],
        ...duplicateColumns(duplicate),
        decision: "pending",
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(notificationCaptures.id, captureId),
          eq(notificationCaptures.userId, userId),
          eq(notificationCaptures.status, "reviewing"),
          eq(
            notificationCaptures.confirmationVersion,
            input.expectedConfirmationVersion,
          ),
        ),
      )
      .run();
    return confirmParsedOn(database, userId, captureId, { decision: "post" });
  }

  return {
    confirmParsedOn,
    confirm,
    confirmMany,
    quickConfirm,
    confirmBillEnrichment,
  };
}
