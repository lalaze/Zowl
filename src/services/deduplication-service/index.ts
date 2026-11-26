import { and, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";

import { db, type Database } from "@/db/client";
import {
  transactions,
  transactionSupplementalEvidence,
  type transactionSources,
} from "@/db/schema";
import { createTransactionFingerprint } from "@/lib/fingerprint";
import { normalizeMerchantName } from "@/lib/merchant";
import { normalizeTransactionTime } from "@/lib/transaction-time";

export type DeduplicationInput = {
  type: "expense" | "income" | "transfer" | "refund";
  amountMinor: number;
  currency: string;
  merchantName: string | null;
  description: string | null;
  transactionTime: string;
  source: (typeof transactionSources)[number];
  platformTransactionId: string | null;
};

export const deduplicationAlgorithmVersion = 3;

export function createDeduplicationService(database: Database = db) {
  function check(
    userId: string,
    input: DeduplicationInput,
    options: { excludeTransactionId?: string } = {},
  ) {
    const transactionTime = normalizeTransactionTime(input.transactionTime);
    const fingerprint = createTransactionFingerprint({
      ...input,
      transactionTime,
    });

    if (input.platformTransactionId) {
      const hasSupplementalEvidenceTable = Boolean(
        database.get<{ name: string }>(
          sql`select name from sqlite_master where type = 'table' and name = 'transaction_supplemental_evidence'`,
        ),
      );
      const supplementalMatch = hasSupplementalEvidenceTable
        ? database
            .select({
              transactionId: transactionSupplementalEvidence.transactionId,
              source: transactionSupplementalEvidence.source,
            })
            .from(transactionSupplementalEvidence)
            .where(
              and(
                eq(transactionSupplementalEvidence.userId, userId),
                eq(
                  transactionSupplementalEvidence.platformTransactionId,
                  input.platformTransactionId,
                ),
              ),
            )
            .get()
        : null;
      if (supplementalMatch) {
        return {
          status:
            supplementalMatch.source === input.source
              ? ("duplicate" as const)
              : ("possible_duplicate" as const),
          transactionId: supplementalMatch.transactionId,
          reason:
            supplementalMatch.source === input.source
              ? "Platform transaction ID is already linked as supplemental bill evidence"
              : "Platform transaction ID is linked to a transaction from another source",
          reasonCode:
            supplementalMatch.source === input.source
              ? ("same_platform_transaction_id" as const)
              : ("cross_source_platform_transaction_id" as const),
          algorithmVersion: deduplicationAlgorithmVersion,
          fingerprint,
        };
      }
      const platformMatches = database
        .select({ id: transactions.id, source: transactions.source })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            isNull(transactions.voidedAt),
            options.excludeTransactionId
              ? ne(transactions.id, options.excludeTransactionId)
              : undefined,
            eq(transactions.platformTransactionId, input.platformTransactionId),
          ),
        )
        .all();
      const exactPlatform =
        platformMatches.find((match) => match.source === input.source) ??
        platformMatches[0];
      if (exactPlatform) {
        return {
          status:
            exactPlatform.source === input.source
              ? ("duplicate" as const)
              : ("possible_duplicate" as const),
          transactionId: exactPlatform.id,
          reason:
            exactPlatform.source === input.source
              ? "Identical platform transaction ID"
              : "Same platform transaction ID from different import sources",
          reasonCode:
            exactPlatform.source === input.source
              ? ("same_platform_transaction_id" as const)
              : ("cross_source_platform_transaction_id" as const),
          algorithmVersion: deduplicationAlgorithmVersion,
          fingerprint,
        };
      }
    }

    const exactFingerprint = database
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          isNull(transactions.voidedAt),
          options.excludeTransactionId
            ? ne(transactions.id, options.excludeTransactionId)
            : undefined,
          eq(transactions.fingerprint, fingerprint),
        ),
      )
      .get();
    if (exactFingerprint) {
      return {
        status: "duplicate" as const,
        transactionId: exactFingerprint.id,
        reason: "Identical source, amount, merchant, and time",
        reasonCode: "exact_fingerprint" as const,
        algorithmVersion: deduplicationAlgorithmVersion,
        fingerprint,
      };
    }

    const normalizedMerchant = normalizeMerchantName(input.merchantName);
    {
      const time = new Date(transactionTime).getTime();
      const from = new Date(time - 5 * 60_000).toISOString();
      const to = new Date(time + 5 * 60_000).toISOString();
      const candidates = database
        .select({
          id: transactions.id,
          merchantName: transactions.merchantName,
          transactionTime: transactions.transactionTime,
          source: transactions.source,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            isNull(transactions.voidedAt),
            options.excludeTransactionId
              ? ne(transactions.id, options.excludeTransactionId)
              : undefined,
            eq(transactions.type, input.type),
            eq(transactions.amountMinor, input.amountMinor),
            eq(transactions.currency, input.currency),
            gte(transactions.transactionTime, from),
            lte(transactions.transactionTime, to),
          ),
        )
        .all();
      // Missing merchant data is uncertainty, not evidence of a new payment.
      // Never merge on this heuristic: preserve the second candidate for review.
      const possible = candidates.find((candidate) => {
        const otherMerchant = normalizeMerchantName(candidate.merchantName);
        if (normalizedMerchant && otherMerchant === normalizedMerchant) return true;
        const captureSources = ["alipay", "wechat", "cmb", "taobao", "pinduoduo", "jd", "pupu", "xianyu"];
        const near = Math.abs(new Date(candidate.transactionTime).getTime() - time) <= 30_000;
        return near && (
          !normalizedMerchant || !otherMerchant ||
          (input.source !== candidate.source && captureSources.includes(input.source) &&
            captureSources.includes(candidate.source))
        );
      });
      if (possible) {
        return {
          status: "possible_duplicate" as const,
          transactionId: possible.id,
          reason: normalizedMerchant && normalizeMerchantName(possible.merchantName) === normalizedMerchant
            ? "Same amount and merchant; transaction times differ by at most 5 minutes"
            : "Same amount within 30 seconds; merchant or payment channel differs or is missing",
          reasonCode: normalizedMerchant && normalizeMerchantName(possible.merchantName) === normalizedMerchant
            ? "same_amount_merchant_near_time" as const
            : "same_amount_uncertain_merchant_near_time" as const,
          algorithmVersion: deduplicationAlgorithmVersion,
          fingerprint,
        };
      }
      const bankPaymentMatch = input.type === "expense" && candidates.find((candidate) =>
        (input.source === "cmb" && ["alipay", "wechat"].includes(candidate.source)) ||
        (candidate.source === "cmb" && ["alipay", "wechat"].includes(input.source)),
      );
      if (bankPaymentMatch) {
        return {
          status: "possible_duplicate" as const,
          transactionId: bankPaymentMatch.id,
          reason: "A bank debit and payment-app transaction have the same amount within 5 minutes; merchant labels may differ",
          reasonCode: "bank_payment_near_time" as const,
          algorithmVersion: deduplicationAlgorithmVersion,
          fingerprint,
        };
      }
    }

    return {
      status: "unique" as const,
      transactionId: null,
      reason: null,
      reasonCode: null,
      algorithmVersion: deduplicationAlgorithmVersion,
      fingerprint,
    };
  }

  return { check };
}

export const deduplicationService = createDeduplicationService();
