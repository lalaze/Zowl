import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { notificationCaptures } from "@/db/schema";
import type { Locale } from "@/lib/i18n/locale";
import {
  createAiCategoryEnrichmentService,
  createOrderDetailsService,
  type AiCategorizationRuntimeResolver,
} from "@/services/ai-categorization-service";
import type { createCategorizationService } from "@/services/categorization-service";
import { ledgerFactsSchema } from "@/services/ledger-transaction/schema";
import { orderSummary } from "@/services/notification-capture-service/platforms";
import {
  duplicateColumns,
  getCaptureRow,
  resolvedFieldOrigins,
  type DeduplicateCapture,
  type StagedCapture,
} from "@/services/notification-capture-service/projection";

type CategorizationService = ReturnType<typeof createCategorizationService>;

export function createNotificationCaptureEnrichment(
  database: Database,
  categorization: CategorizationService,
  aiRuntimeFor: AiCategorizationRuntimeResolver,
  deduplicate: DeduplicateCapture,
) {
  // 购物应用的支付页候选可以带上付款前下单页的文字（ADR-0014）。在入账之前
  // 请模型读出买了什么：店铺写入商户（解析器没给时）、商品摘要写入描述、
  // 高置信的分类直接采用，逐件清单存在候选上。原文只在这次请求的内存里，
  // 不入库、不写日志。模型失败、未启用或读不出商品时候选保持原样。
  async function enrichWithOrderDetails(
    userId: string,
    accepted: StagedCapture[],
    locale: Locale,
  ) {
    const eligible = accepted.filter(
      (item) => item.orderContext && item.duplicateStatus !== "duplicate",
    );
    if (!eligible.length) return;
    const runtime = aiRuntimeFor(userId);
    if (!runtime.provider.enabled) return;
    const orderDetails = createOrderDetailsService(database, runtime);
    const outcomes = await Promise.all(
      eligible.map((item) =>
        orderDetails.extract(
          userId,
          {
            platform: item.platform,
            amountMinor: item.facts.amountMinor,
            currency: item.facts.currency,
            pages: item.orderContext!,
          },
          locale,
        ),
      ),
    );
    eligible.forEach((item, index) => {
      const outcome = outcomes[index]!;
      // One model call per candidate: the device waits for this response, so a
      // candidate the model was asked about is not sent for plain categorization too.
      item.orderDetailsAttempted = outcome.attempted;
      const details = outcome.details;
      if (!details) return;
      const row = getCaptureRow(database, userId, item.captureId);
      if (!row || row.status !== "reviewing") return;

      const merchantName = item.facts.merchantName ?? details.shopName;
      const description = orderSummary(details.items, locale);
      // A category the user taught for this shop outranks the model; the model
      // outranks keyword matching, which only sees the summary.
      const rule = categorization.suggest({
        userId,
        type: item.facts.type,
        merchantName,
        description,
      });
      const category =
        rule.ruleSource === "merchant_rule" && rule.categoryId
          ? { id: rule.categoryId, origin: "categorization_rule" as const }
          : details.categoryId
            ? { id: details.categoryId, origin: "ai_suggestion" as const }
            : rule.ruleSource === "keyword" && rule.categoryId
              ? { id: rule.categoryId, origin: "categorization_rule" as const }
              : null;
      const parsed = ledgerFactsSchema.safeParse({
        ...item.facts,
        merchantName,
        description,
        categoryId: category?.id ?? item.facts.categoryId,
      });
      if (!parsed.success) return;
      const nextFacts = parsed.data;

      const origins = resolvedFieldOrigins(row);
      const merchantFilled = merchantName !== item.facts.merchantName;
      // The merchant is part of what makes two records the same payment.
      const duplicate = merchantFilled
        ? deduplicate(userId, item.platform, nextFacts)
        : null;
      database
        .update(notificationCaptures)
        .set({
          normalizedData: nextFacts,
          fieldOrigins: {
            ...origins,
            merchantName: merchantFilled ? "ai_suggestion" : origins.merchantName,
            description: "ai_suggestion",
            categoryId: category?.origin ?? origins.categoryId,
          },
          orderDetails: {
            shopName: details.shopName,
            items: details.items,
            extractedAt: new Date().toISOString(),
            model: details.model,
            configurationFingerprint: details.configurationFingerprint,
          },
          ...(duplicate ? duplicateColumns(duplicate) : {}),
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(notificationCaptures.id, item.captureId),
            eq(notificationCaptures.userId, userId),
          ),
        )
        .run();
      item.facts = nextFacts;
      if (duplicate) item.duplicateStatus = duplicate.status;
    });
  }

  // 通知链路的 AI 分类：本地规则只能落到兜底的候选，在接收时自动请求一次
  // AI 分类；高置信且无歧义的建议直接采用（字段来源 ai_suggestion），
  // 低置信、歧义、失败或未启用时保持本地规则结果，不影响后续入账流程。
  async function enrichWithAiCategories(
    userId: string,
    accepted: StagedCapture[],
    locale: Locale,
  ) {
    const eligible = accepted.filter(
      (item) =>
        item.duplicateStatus !== "duplicate" &&
        !item.orderDetailsAttempted &&
        (item.categoryRuleSource === "type_default" ||
          item.categoryRuleSource === "none"),
    );
    if (!eligible.length) return;
    const runtime = aiRuntimeFor(userId);
    if (!runtime.provider.enabled) return;
    const enrichment = createAiCategoryEnrichmentService(database, runtime);
    const result = await enrichment.classify(
      userId,
      eligible.map((item) => ({
        itemRef: item.captureId,
        type: item.facts.type,
        source: item.platform,
        merchantName: item.facts.merchantName,
        description: item.facts.description,
      })),
      locale,
    );
    for (const item of eligible) {
      const suggestion = result.suggestions.get(item.captureId);
      if (
        !suggestion ||
        suggestion.status !== "auto_applied" ||
        !suggestion.categoryId
      ) {
        continue;
      }
      const row = getCaptureRow(database, userId, item.captureId);
      if (!row || row.status !== "reviewing") continue;
      const nextFacts = { ...item.facts, categoryId: suggestion.categoryId };
      database
        .update(notificationCaptures)
        .set({
          normalizedData: nextFacts,
          fieldOrigins: {
            ...resolvedFieldOrigins(row),
            categoryId: "ai_suggestion",
          },
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(notificationCaptures.id, item.captureId),
            eq(notificationCaptures.userId, userId),
          ),
        )
        .run();
      item.facts = nextFacts;
    }
  }

  return { enrichWithOrderDetails, enrichWithAiCategories };
}
