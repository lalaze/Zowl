import { and, eq, gte, isNull, lte } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
  notificationCaptures,
  transactions,
  transactionSupplementalEvidence,
} from "@/db/schema";
import { createCategorizationService } from "@/services/categorization-service";
import type {
  BillEnrichmentData,
  BillEnrichmentField,
  BillEnrichmentValues,
  NormalizedImportTransaction,
} from "@/services/import-service/types";
import {
  ledgerFactsSchema,
  type LedgerFacts,
} from "@/services/ledger-transaction/schema";

const protectedOrigins = new Set([
  "quick_input",
  "manual_edit",
  "legacy_unknown",
  "user",
]);

type Candidate = {
  targetKind: "notification_capture" | "transaction";
  targetId: string;
  captureId: string;
  targetVersion: string;
  facts: LedgerFacts;
  origins: Partial<Record<BillEnrichmentField, string>>;
};

function isSameInstantWithinFiveMinutes(left: string, right: string) {
  return Math.abs(new Date(left).getTime() - new Date(right).getTime()) <= 300_000;
}

function captureOrigins(
  row: typeof notificationCaptures.$inferSelect,
) {
  const stored = row.fieldOrigins ?? {};
  return {
    merchantName: stored.merchantName ?? "legacy_unknown",
    description: stored.description ?? "legacy_unknown",
    paymentMethod: stored.paymentMethod ?? "legacy_unknown",
    categoryId: stored.categoryId ?? "legacy_unknown",
  };
}

function values(facts: LedgerFacts): BillEnrichmentValues {
  return {
    merchantName: facts.merchantName,
    description: facts.description,
    paymentMethod: facts.paymentMethod,
    categoryId: facts.categoryId,
  };
}

export function createAlipayBillEnrichmentMatcher(database: Database) {
  const categorization = createCategorizationService(database);

  function candidates(
    userId: string,
    data: NormalizedImportTransaction,
  ): Candidate[] {
    if (
      data.source !== "alipay" ||
      data.type !== "expense" ||
      !data.amountMinor ||
      !data.transactionTime
    ) {
      return [];
    }
    const time = new Date(data.transactionTime).getTime();
    const from = new Date(time - 300_000).toISOString();
    const to = new Date(time + 300_000).toISOString();
    const captures = database
      .select()
      .from(notificationCaptures)
      .where(
        and(
          eq(notificationCaptures.userId, userId),
          eq(notificationCaptures.platform, "alipay"),
          gte(notificationCaptures.notificationPostedAt, from),
          lte(notificationCaptures.notificationPostedAt, to),
        ),
      )
      .all();

    return captures.flatMap((capture): Candidate[] => {
      const parsedCapture = ledgerFactsSchema.safeParse(capture.normalizedData);
      if (!parsedCapture.success) return [];
      if (capture.status === "reviewing") {
        const facts = parsedCapture.data;
        if (
          facts.type !== "expense" ||
          facts.amountMinor !== data.amountMinor ||
          facts.currency !== data.currency ||
          !isSameInstantWithinFiveMinutes(
            facts.transactionTime,
            data.transactionTime!,
          )
        ) {
          return [];
        }
        return [
          {
            targetKind: "notification_capture",
            targetId: capture.id,
            captureId: capture.id,
            targetVersion: String(capture.confirmationVersion),
            facts,
            origins: captureOrigins(capture),
          },
        ];
      }
      if (!capture.resultTransactionId) return [];
      const transaction = database
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.id, capture.resultTransactionId),
            eq(transactions.userId, userId),
            isNull(transactions.voidedAt),
          ),
        )
        .get();
      if (
        !transaction ||
        transaction.type !== "expense" ||
        transaction.amountMinor !== data.amountMinor ||
        transaction.currency !== data.currency ||
        !isSameInstantWithinFiveMinutes(
          transaction.transactionTime,
          data.transactionTime!,
        )
      ) {
        return [];
      }
      const facts = ledgerFactsSchema.parse({
        type: transaction.type,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        merchantName: transaction.merchantName,
        description: transaction.description,
        categoryId: transaction.categoryId,
        transactionTime: transaction.transactionTime,
        paymentMethod: transaction.paymentMethod,
      });
      const originalFacts = parsedCapture.data;
      const originalOrigins = captureOrigins(capture);
      const origins = Object.fromEntries(
        (
          [
            "merchantName",
            "description",
            "paymentMethod",
            "categoryId",
          ] as const
        ).map((field) => [
          field,
          facts[field] === originalFacts[field]
            ? originalOrigins[field]
            : "legacy_unknown",
        ]),
      );
      return [
        {
          targetKind: "transaction",
          targetId: transaction.id,
          captureId: capture.id,
          targetVersion:
            transaction.currentRevisionId ?? `legacy:${transaction.revisionNumber}`,
          facts,
          origins,
        },
      ];
    });
  }

  function match(
    userId: string,
    data: NormalizedImportTransaction,
  ): BillEnrichmentData | null {
    if (
      data.platformTransactionId &&
      database
        .select({ id: transactionSupplementalEvidence.id })
        .from(transactionSupplementalEvidence)
        .where(
          and(
            eq(transactionSupplementalEvidence.userId, userId),
            eq(transactionSupplementalEvidence.source, "alipay"),
            eq(
              transactionSupplementalEvidence.platformTransactionId,
              data.platformTransactionId,
            ),
          ),
        )
        .get()
    ) {
      return null;
    }
    const matches = candidates(userId, data);
    const proposed: BillEnrichmentValues = {
      merchantName: data.merchantName,
      description: data.description,
      paymentMethod: data.paymentMethod,
      categoryId: categorization.suggest({
        userId,
        type: "expense",
        merchantName: data.merchantName,
        description: data.description,
      }).categoryId,
    };
    if (matches.length === 0) return null;
    if (matches.length > 1) {
      return {
        status: "ambiguous",
        targetKind: null,
        targetId: null,
        captureId: null,
        targetVersion: null,
        current: null,
        proposed,
        conflicts: [],
        resolutions: {},
        candidateTargetIds: matches.map((candidate) => candidate.targetId),
      };
    }

    const target = matches[0]!;
    const current = values(target.facts);
    const fields = Object.keys(proposed) as BillEnrichmentField[];
    const conflicts = fields.filter(
      (field) =>
        proposed[field] !== null &&
        current[field] !== null &&
        current[field] !== proposed[field] &&
        protectedOrigins.has(target.origins[field] ?? "user"),
    );
    const resolutions = Object.fromEntries(
      fields
        .filter(
          (field) => proposed[field] !== null && !conflicts.includes(field),
        )
        .map((field) => [field, "use_bill" as const]),
    );
    return {
      status: conflicts.length ? "conflict" : "ready",
      targetKind: target.targetKind,
      targetId: target.targetId,
      captureId: target.captureId,
      targetVersion: target.targetVersion,
      immutable: {
        amountMinor: target.facts.amountMinor,
        currency: target.facts.currency,
        transactionTime: target.facts.transactionTime,
      },
      current,
      proposed,
      conflicts,
      resolutions,
    };
  }

  return { match };
}
