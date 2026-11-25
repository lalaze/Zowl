import { createHash } from "node:crypto";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { type Database, db } from "@/db/client";
import { categories, transactions, type transactionSources } from "@/db/schema";
import { defaultLocale, type Locale } from "@/lib/i18n/locale";
import { getDefaultCategory } from "@/services/categorization-service/default-category";
import { categoryKindSupportsTransaction } from "@/lib/category-kind";
import { normalizeMerchantName } from "@/lib/merchant";
import { createAiCategoryEnrichmentService } from "@/services/ai-categorization-service/enrichment";
import { createAiCategorizationSettingsService } from "@/services/ai-categorization-service/settings";
import { sanitizeAiCategoryText } from "@/services/ai-categorization-service/schema";
import type {
  AiCategorizationRuntime,
  AiCategorizationRuntimeResolver,
} from "@/services/ai-categorization-service/types";
import {
  createLedgerTransactionService,
  LedgerTransactionError,
} from "@/services/ledger-transaction";

export const historicalAiPreviewSchema = z
  .object({
    cursor: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();

export const historicalAiApplySchema = z
  .object({
    operationId: z.string().trim().min(1).max(100),
    changes: z
      .array(
        z
          .object({
            transactionId: z.string().trim().min(1).max(160),
            expectedRevisionId: z.string().trim().min(1).max(160),
            categoryId: z.string().trim().min(1).max(160),
            learnCategoryRule: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

export type HistoricalAiApplyInput = z.infer<typeof historicalAiApplySchema>;

type EligibleTransaction = {
  id: string;
  currentRevisionId: string;
  type: "expense" | "income";
  amountMinor: number;
  currency: string;
  merchantName: string | null;
  description: string | null;
  categoryId: string;
  transactionTime: string;
  source: (typeof transactionSources)[number];
  paymentMethod: string | null;
};

function groupKey(item: EligibleTransaction) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        type: item.type,
        merchantName: normalizeMerchantName(item.merchantName),
        description: sanitizeAiCategoryText(item.description, 500),
      }),
    )
    .digest("hex");
}

export function createHistoricalAiReclassificationService(
  database: Database = db,
  runtimeSource?: AiCategorizationRuntime | AiCategorizationRuntimeResolver,
) {
  const ledger = createLedgerTransactionService(database);
  const source =
    runtimeSource ??
    createAiCategorizationSettingsService(database).resolveRuntime;
  const runtimeFor = (userId: string) =>
    typeof source === "function" ? source(userId) : source;

  function eligibleTransactions(userId: string): EligibleTransaction[] {
    return database
      .select({
        id: transactions.id,
        currentRevisionId: transactions.currentRevisionId,
        type: transactions.type,
        amountMinor: transactions.amountMinor,
        currency: transactions.currency,
        merchantName: transactions.merchantName,
        description: transactions.description,
        categoryId: transactions.categoryId,
        transactionTime: transactions.transactionTime,
        source: transactions.source,
        paymentMethod: transactions.paymentMethod,
      })
      .from(transactions)
      .innerJoin(
        categories,
        and(
          eq(transactions.categoryId, categories.id),
          eq(categories.userId, userId),
        ),
      )
      .where(
        and(
          eq(transactions.userId, userId),
          isNull(transactions.voidedAt),
          eq(categories.id, getDefaultCategory(database, userId, "other")?.id ?? ""),
          inArray(transactions.type, ["expense", "income"]),
        ),
      )
      .orderBy(desc(transactions.transactionTime), desc(transactions.id))
      .all()
      .flatMap((item) =>
        item.currentRevisionId &&
        item.categoryId &&
        (item.type === "expense" || item.type === "income")
          ? [item as EligibleTransaction]
          : [],
      );
  }

  /** `locale`: the language AI reasons are written in (the requester's UI language). */
  async function preview(
    userId: string,
    rawInput: z.input<typeof historicalAiPreviewSchema>,
    locale: Locale = defaultLocale,
  ) {
    const input = historicalAiPreviewSchema.parse(rawInput);
    const runtime = runtimeFor(userId);
    const enrichment = createAiCategoryEnrichmentService(database, runtime);
    const grouped = new Map<string, EligibleTransaction[]>();
    for (const item of eligibleTransactions(userId)) {
      const key = groupKey(item);
      const current = grouped.get(key) ?? [];
      current.push(item);
      grouped.set(key, current);
    }
    const allGroups = [...grouped.entries()];
    const pageLimit = Math.min(input.limit, runtime.batchSize);
    const pageGroups = allGroups.slice(input.cursor, input.cursor + pageLimit);
    const classified = await enrichment.classify(
      userId,
      pageGroups.map(([id, items]) => ({
        itemRef: id,
        type: items[0]!.type,
        source: items[0]!.source,
        merchantName: items[0]!.merchantName,
        description: items[0]!.description,
      })),
      locale,
    );

    const groups = pageGroups.map(([id, items]) => {
      const amounts: Record<string, number> = {};
      for (const item of items) {
        amounts[item.currency] = (amounts[item.currency] ?? 0) + item.amountMinor;
      }
      return {
        id,
        type: items[0]!.type,
        merchantName: items[0]!.merchantName,
        description: items[0]!.description,
        transactionCount: items.length,
        amounts,
        latestTransactionTime: items[0]!.transactionTime,
        members: items.map((item) => ({
          transactionId: item.id,
          expectedRevisionId: item.currentRevisionId,
        })),
        suggestion: classified.suggestions.get(id) ?? null,
      };
    });
    const nextCursor = input.cursor + pageGroups.length;
    return {
      enabled: classified.enabled,
      failed: classified.failed,
      errorCode: classified.errorCode,
      groups,
      totalGroups: allGroups.length,
      nextCursor: nextCursor < allGroups.length ? nextCursor : null,
    };
  }

  function apply(userId: string, rawInput: HistoricalAiApplyInput) {
    const input = historicalAiApplySchema.parse(rawInput);
    const otherCategory = getDefaultCategory(database, userId, "other");
    const outcomes: Array<{
      transactionId: string;
      status: "applied" | "conflict" | "failed";
      code: string | null;
    }> = [];

    input.changes.forEach((change, index) => {
      const current = database
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.id, change.transactionId),
            eq(transactions.userId, userId),
          ),
        )
        .get();
      const target = database
        .select({ id: categories.id, kind: categories.kind })
        .from(categories)
        .where(
          and(
            eq(categories.id, change.categoryId),
            eq(categories.userId, userId),
          ),
        )
        .get();
      if (
        !current ||
        current.voidedAt ||
        !current.currentRevisionId ||
        current.currentRevisionId !== change.expectedRevisionId ||
        current.categoryId !== otherCategory?.id ||
        (current.type !== "expense" && current.type !== "income") ||
        !target ||
        target.id === otherCategory?.id ||
        !categoryKindSupportsTransaction(target.kind, current.type)
      ) {
        outcomes.push({
          transactionId: change.transactionId,
          status: "conflict",
          code: "TRANSACTION_CHANGED",
        });
        return;
      }

      try {
        const outcome = ledger.amendTransaction(userId, {
          transactionId: current.id,
          expectedRevisionId: current.currentRevisionId,
          operationId: `ai-reclass:${input.operationId}:${index}`,
          facts: {
            type: current.type,
            amountMinor: current.amountMinor,
            currency: current.currency,
            merchantName: current.merchantName,
            description: current.description,
            categoryId: target.id,
            transactionTime: current.transactionTime,
            paymentMethod: current.paymentMethod,
          },
          learnCategoryRule:
            change.learnCategoryRule && Boolean(current.merchantName),
        });
        outcomes.push({
          transactionId: current.id,
          status: outcome.status === "completed" ? "applied" : "conflict",
          code: outcome.status === "completed" ? null : "DUPLICATE_REVIEW_REQUIRED",
        });
      } catch (error) {
        outcomes.push({
          transactionId: current.id,
          status: error instanceof LedgerTransactionError ? "conflict" : "failed",
          code:
            error instanceof LedgerTransactionError
              ? error.code
              : "RECLASSIFICATION_FAILED",
        });
      }
    });

    return {
      outcomes,
      appliedCount: outcomes.filter((item) => item.status === "applied").length,
      conflictCount: outcomes.filter((item) => item.status === "conflict").length,
      failedCount: outcomes.filter((item) => item.status === "failed").length,
    };
  }

  return {
    preview,
    apply,
    getMetadata: (userId: string) => runtimeFor(userId).metadata,
  };
}

export const historicalAiReclassificationService =
  createHistoricalAiReclassificationService();
