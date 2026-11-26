import {
  captureSourceKind,
  isPaymentPageOcrParser,
  isPaymentPageParser,
} from "@/lib/capture-source";
import { randomUUID } from "node:crypto";

import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import {
  type CaptureOrderItem,
  notificationCaptureFieldOrigins,
  type notificationCapturePlatforms,
  notificationCaptures,
  notificationCaptureSettings,
  notificationCaptureStatuses,
  transactions,
} from "@/db/schema";
import { defaultLocale, translator, type Locale } from "@/lib/i18n/locale";
import { normalizeMerchantName } from "@/lib/merchant";
import { publicOrderDetails } from "@/lib/order-details";
import {
  createAiCategorizationSettingsService,
  createAiCategoryEnrichmentService,
  createOrderDetailsService,
  type AiCategorizationRuntime,
  type AiCategorizationRuntimeResolver,
  type OrderContextPage,
} from "@/services/ai-categorization-service";
import { createCategorizationService } from "@/services/categorization-service";
import { createDeduplicationService } from "@/services/deduplication-service";
import {
  duplicateAssessmentDigest,
  toDuplicateAssessment,
} from "@/services/ledger-transaction/review-decision";
import { createLedgerTransactionService } from "@/services/ledger-transaction";
import {
  ledgerFactsSchema,
  type LedgerFacts,
} from "@/services/ledger-transaction/schema";
import { assertLedgerCategory } from "@/services/ledger-transaction/validation";
import { NotificationCaptureServiceError } from "@/services/notification-capture-service/error";
import {
  notificationCaptureBatchSchema,
  notificationCaptureBulkConfirmSchema,
  notificationCaptureConfirmSchema,
  notificationCaptureEditSchema,
  notificationCaptureEventSchema,
  notificationCaptureListQuerySchema,
  notificationCaptureQuickConfirmSchema,
  notificationCaptureSettingsInputSchema,
  type NotificationCaptureEvent,
  type NotificationCaptureSettingsInput,
} from "@/services/notification-capture-service/schema";

type CapturePlatform = (typeof notificationCapturePlatforms)[number];

const packageForPlatform = {
  alipay: "com.eg.android.AlipayGphone",
  wechat: "com.tencent.mm",
  cmb: "cmb.pb",
  taobao: "com.taobao.taobao",
  pinduoduo: "com.xunmeng.pinduoduo",
  jd: "com.jingdong.app.mall",
  pupu: "com.pupumall.customer",
  xianyu: "com.taobao.idlefish",
} as const satisfies Record<CapturePlatform, string>;

// Only platforms that ever had a notification parser. The shopping apps are
// read from payment pages alone, which autoPostPaymentPages authorizes.
const autoPostFieldForPlatform: Partial<
  Record<CapturePlatform, "autoPostAlipay" | "autoPostWechat" | "autoPostCmb">
> = {
  alipay: "autoPostAlipay",
  wechat: "autoPostWechat",
  cmb: "autoPostCmb",
};

export type NotificationCaptureSettings = {
  autoPostAlipay: boolean;
  autoPostWechat: boolean;
  autoPostCmb: boolean;
  autoPostPaymentPages: boolean;
  autoPostMaxAmountMinor: number;
  autoPostTrustedMaxAmountMinor: number;
};

const defaultCaptureSettings: NotificationCaptureSettings = {
  autoPostAlipay: false,
  autoPostWechat: false,
  autoPostCmb: false,
  autoPostPaymentPages: false,
  autoPostMaxAmountMinor: 50_000,
  autoPostTrustedMaxAmountMinor: 500_000,
};

// 同一规范商户累计 5 笔未修正、未作废的自动入账后视为可信商户，
// 可信商户的自动入账上限放宽到 autoPostTrustedMaxAmountMinor。
const TRUSTED_MERCHANT_MIN_AUTO_POSTS = 5;

// Written into the candidate's description and payment method in the language
// of the capture request. They are system defaults (field origin
// "system_default"), so a matching statement may replace them; nothing
// compares them by value, so old English and new Chinese rows mix safely.
const labelForPlatform: Record<Locale, Record<CapturePlatform, string>> = {
  en: {
    alipay: "Alipay",
    wechat: "WeChat",
    cmb: "China Merchants Bank",
    taobao: "Taobao",
    pinduoduo: "Pinduoduo",
    jd: "JD.com",
    pupu: "Pupu",
    xianyu: "Xianyu",
  },
  zh: {
    alipay: "支付宝",
    wechat: "微信",
    cmb: "招商银行",
    taobao: "淘宝",
    pinduoduo: "拼多多",
    jd: "京东",
    pupu: "朴朴",
    xianyu: "闲鱼",
  },
};

function captureDescription(event: NotificationCaptureEvent, locale: Locale) {
  const t = translator(locale);
  const label = labelForPlatform[locale][event.platform];
  if (isPaymentPageOcrParser(event.parserId)) {
    return t(`${label} payment success page (on-device OCR)`, `${label}支付成功页（本地识别）`);
  }
  if (isPaymentPageParser(event.parserId)) {
    return t(`${label} payment success page`, `${label}支付成功页`);
  }
  if (event.platform === "cmb") {
    return t("CMB debit notification", "招商银行扣费通知");
  }
  return t(`${label} payment notification`, `${label}支付通知`);
}

const ORDER_SUMMARY_NAME_LENGTH = 60;

/** The candidate's description once its goods are known: what was bought. */
function orderSummary(items: CaptureOrderItem[], locale: Locale) {
  const t = translator(locale);
  const first = items[0]!.name.slice(0, ORDER_SUMMARY_NAME_LENGTH);
  if (items.length === 1) return first;
  return t(
    `${first} and ${items.length - 1} more`,
    `${first}等${items.length}件`,
  );
}

const knownParserIdentities = {
  alipay: new Set([
    "alipay_payment_page_v1:1",
    "alipay_payment_page_ocr_v1:1",
    "alipay-payment-success:1",
    "alipay_success_v1:1",
    "alipay_expense_reminder_v1:1",
    "alipay_success_v2:2",
    "alipay_expense_reminder_v2:2",
  ]),
  wechat: new Set([
    "wechat-payment-success:1",
    "wechat_success_v1:1",
    "wechat_payment_page_v1:1",
    "wechat_payment_page_ocr_v1:1",
  ]),
  cmb: new Set(["cmb_debit_v1:1"]),
  // Node text of the embedded cashier, or its amount confirmed by OCR of the result page.
  taobao: new Set(["taobao_payment_page_v1:1", "taobao_payment_page_ocr_v1:1"]),
  pinduoduo: new Set(["pinduoduo_payment_page_v1:1"]),
  jd: new Set(["jd_payment_page_v1:1"]),
  // The checkout amount, confirmed by the app once the order goes through.
  pupu: new Set(["pupu_payment_page_v1:1"]),
  // Node text or OCR of the embedded cashier, or its amount confirmed by the result page.
  xianyu: new Set(["xianyu_payment_page_v1:1", "xianyu_payment_page_ocr_v1:1"]),
} satisfies Record<keyof typeof packageForPlatform, ReadonlySet<string>>;

function notFound(): never {
  throw new NotificationCaptureServiceError(
    "NOTIFICATION_CAPTURE_NOT_FOUND",
    "Notification candidate not found",
    404,
  );
}

function parseFacts(value: unknown) {
  const parsed = ledgerFactsSchema.safeParse(value);
  if (!parsed.success) {
    throw new NotificationCaptureServiceError(
      "NOTIFICATION_CAPTURE_INVALID",
      "Notification candidate fields are stale. Edit again",
      409,
    );
  }
  return parsed.data;
}

type FieldOrigin = (typeof notificationCaptureFieldOrigins)[number];
type FieldOrigins = Record<
  "merchantName" | "description" | "paymentMethod" | "categoryId",
  FieldOrigin
>;

function resolvedFieldOrigins(
  row: typeof notificationCaptures.$inferSelect,
): FieldOrigins {
  const stored = row.fieldOrigins ?? {};
  return {
    merchantName: stored.merchantName ?? "legacy_unknown",
    description: stored.description ?? "legacy_unknown",
    paymentMethod: stored.paymentMethod ?? "legacy_unknown",
    categoryId: stored.categoryId ?? "legacy_unknown",
  };
}

function project(row: typeof notificationCaptures.$inferSelect) {
  const facts = parseFacts(row.normalizedData);
  return {
    id: row.id,
    platform: row.platform,
    sourcePackage: row.sourcePackage,
    captureMethod: isPaymentPageParser(row.parserId) ? "payment_page" : "notification",
    notificationPostedAt: row.notificationPostedAt,
    parserId: row.parserId,
    parserVersion: row.parserVersion,
    confidenceBasisPoints: row.confidenceBasisPoints,
    ...facts,
    fieldOrigins: resolvedFieldOrigins(row),
    duplicateStatus: row.duplicateStatus,
    duplicateTransactionId: row.duplicateTransactionId,
    duplicateAssessmentDigest: row.duplicateAssessmentDigest,
    decision: row.decision,
    status: row.status,
    warnings: row.warnings,
    validationErrors: row.validationErrors,
    resultTransactionId: row.resultTransactionId,
    resultCode: row.resultCode,
    orderDetails: publicOrderDetails(row.orderDetails),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    confirmationVersion: row.confirmationVersion,
  };
}

function completedResult(row: typeof notificationCaptures.$inferSelect) {
  const outcome =
    row.resultCode === "IMPORTED" || row.resultCode === "AUTO_POSTED"
      ? "posted"
      : row.resultCode === "SKIPPED_DUPLICATE" ||
          row.resultCode === "AUTO_SKIPPED_DUPLICATE"
        ? "duplicate"
        : "skipped";
  return {
    status: "completed" as const,
    capture: project(row),
    outcome: {
      sourceItemRef: row.id,
      outcome,
      transactionId:
        outcome === "duplicate"
          ? row.duplicateTransactionId
          : row.resultTransactionId,
      revisionId: null,
    },
  };
}

export function createNotificationCaptureService(
  database: Database = db,
  aiRuntimeSource?: AiCategorizationRuntime | AiCategorizationRuntimeResolver,
) {
  const categorization = createCategorizationService(database);
  const deduplication = createDeduplicationService(database);
  const runtimeSource =
    aiRuntimeSource ??
    createAiCategorizationSettingsService(database).resolveRuntime;
  const aiRuntimeFor = (userId: string) =>
    typeof runtimeSource === "function"
      ? runtimeSource(userId)
      : runtimeSource;

  function getRowFrom(
    source: Database,
    userId: string,
    captureId: string,
  ) {
    return source
      .select()
      .from(notificationCaptures)
      .where(
        and(
          eq(notificationCaptures.id, captureId),
          eq(notificationCaptures.userId, userId),
        ),
      )
      .get();
  }

  function getRow(userId: string, captureId: string) {
    return getRowFrom(database, userId, captureId);
  }

  function get(userId: string, captureId: string) {
    const row = getRow(userId, captureId);
    if (!row) notFound();
    return project(row);
  }

  function getSettings(userId: string): NotificationCaptureSettings {
    const row = database
      .select()
      .from(notificationCaptureSettings)
      .where(eq(notificationCaptureSettings.userId, userId))
      .get();
    if (!row) return { ...defaultCaptureSettings };
    return {
      autoPostAlipay: row.autoPostAlipay,
      autoPostWechat: row.autoPostWechat,
      autoPostCmb: row.autoPostCmb,
      autoPostPaymentPages: row.autoPostPaymentPages,
      autoPostMaxAmountMinor: row.autoPostMaxAmountMinor,
      autoPostTrustedMaxAmountMinor: row.autoPostTrustedMaxAmountMinor,
    };
  }

  function updateSettings(
    userId: string,
    rawInput: unknown,
  ): NotificationCaptureSettings {
    const input: NotificationCaptureSettingsInput =
      notificationCaptureSettingsInputSchema.parse(rawInput);
    const next = { ...getSettings(userId), ...input };
    const now = new Date().toISOString();
    database
      .insert(notificationCaptureSettings)
      .values({ userId, ...next, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: notificationCaptureSettings.userId,
        set: { ...next, updatedAt: now },
      })
      .run();
    return next;
  }

  function deduplicate(
    userId: string,
    platform: CapturePlatform,
    facts: LedgerFacts,
  ) {
    return deduplication.check(userId, {
      type: facts.type,
      amountMinor: facts.amountMinor,
      currency: facts.currency,
      merchantName: facts.merchantName,
      description: facts.description,
      transactionTime: facts.transactionTime,
      source: platform,
      platformTransactionId: null,
    });
  }

  function suggestedFacts(
    userId: string,
    event: NotificationCaptureEvent,
    locale: Locale,
  ) {
    const description = captureDescription(event, locale);
    const category = categorization.suggest({
      userId,
      type: "expense",
      merchantName: event.facts.merchantName,
      description,
    });
    const facts = ledgerFactsSchema.parse({
      type: "expense",
      amountMinor: event.facts.amountMinor,
      currency: "CNY",
      merchantName: event.facts.merchantName,
      description,
      categoryId: category.categoryId,
      transactionTime: event.postedAt,
      paymentMethod: labelForPlatform[locale][event.platform],
    });
    return { facts, categoryRuleSource: category.ruleSource };
  }

  function confirmParsedOn(
    source: Database,
    userId: string,
    captureId: string,
    input: unknown,
  ) {
    const parsed = notificationCaptureConfirmSchema.parse(input);
    const current = getRowFrom(source, userId, captureId);
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

    const confirmation = createLedgerTransactionService(source).confirmPosting(userId, {
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
    });

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
        capture: project(getRowFrom(source, userId, captureId)!),
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
          outcome.outcome === "duplicate" ? "duplicate" : current.duplicateStatus,
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
      capture: project(getRowFrom(source, userId, captureId)!),
      outcome,
    };
  }

  function confirmParsed(
    userId: string,
    captureId: string,
    input: unknown,
  ) {
    return confirmParsedOn(database, userId, captureId, input);
  }

  type StagedCapture = {
    idempotencyKey: string;
    captureId: string;
    platform: CapturePlatform;
    facts: LedgerFacts;
    categoryRuleSource: ReturnType<typeof categorization.suggest>["ruleSource"];
    duplicateStatus: "unique" | "possible_duplicate" | "duplicate";
    /** Held for this request only; never stored. */
    orderContext: OrderContextPage[] | null;
    /** The model was already asked about this candidate once. */
    orderDetailsAttempted: boolean;
  };

  type IngestStage =
    | {
        outcome: "staged";
        staged: StagedCapture;
      }
    | {
        outcome: "terminal";
        result:
          | {
              idempotencyKey: string | null;
              status: "rejected";
              code: string;
            }
          | {
              idempotencyKey: string;
              status: "already_accepted";
              captureId: string;
              reviewStatus: (typeof notificationCaptureStatuses)[number];
            };
      };

  function ingestOne(
    userId: string,
    rawEvent: unknown,
    locale: Locale,
  ): IngestStage {
    const parsed = notificationCaptureEventSchema.safeParse(rawEvent);
    if (!parsed.success) {
      return {
        outcome: "terminal",
        result: {
          idempotencyKey:
            typeof (rawEvent as { idempotencyKey?: unknown })?.idempotencyKey ===
            "string"
              ? (rawEvent as { idempotencyKey: string }).idempotencyKey
              : null,
          status: "rejected" as const,
          code: "INVALID_EVENT",
        },
      };
    }
    const event = parsed.data;
    if (packageForPlatform[event.platform] !== event.sourcePackage) {
      return {
        outcome: "terminal",
        result: {
          idempotencyKey: event.idempotencyKey,
          status: "rejected" as const,
          code: "SOURCE_PACKAGE_MISMATCH",
        },
      };
    }
    if (
      !knownParserIdentities[event.platform].has(
        `${event.parserId}:${event.parserVersion}`,
      )
    ) {
      return {
        outcome: "terminal",
        result: {
          idempotencyKey: event.idempotencyKey,
          status: "rejected" as const,
          code: "UNSUPPORTED_PARSER",
        },
      };
    }

    const existing = database
      .select()
      .from(notificationCaptures)
      .where(
        and(
          eq(notificationCaptures.userId, userId),
          eq(notificationCaptures.idempotencyKey, event.idempotencyKey),
        ),
      )
      .get();
    if (existing) {
      return {
        outcome: "terminal",
        result: {
          idempotencyKey: event.idempotencyKey,
          status: "already_accepted" as const,
          captureId: existing.id,
          reviewStatus: existing.status,
        },
      };
    }

    const { facts, categoryRuleSource } = suggestedFacts(userId, event, locale);
    const duplicate = deduplicate(userId, event.platform, facts);
    const assessment = toDuplicateAssessment(duplicate);
    const now = new Date().toISOString();
    const id = randomUUID();
    database
      .insert(notificationCaptures)
      .values({
        id,
        userId,
        idempotencyKey: event.idempotencyKey,
        platform: event.platform,
        sourcePackage: event.sourcePackage,
        notificationPostedAt: event.postedAt,
        parserId: event.parserId,
        parserVersion: event.parserVersion,
        evidenceDigest: event.evidenceDigest,
        confidenceBasisPoints: event.confidenceBasisPoints,
        normalizedData: facts,
        fieldOrigins: {
          merchantName: "parser",
          description: "system_default",
          paymentMethod: "system_default",
          categoryId: "categorization_rule",
        },
        validationErrors: [],
        warnings: duplicate.reason ? [duplicate.reason] : [],
        duplicateStatus: duplicate.status,
        duplicateTransactionId: duplicate.transactionId,
        duplicateAssessmentDigest:
          duplicate.status === "possible_duplicate"
            ? duplicateAssessmentDigest(assessment)
            : null,
        decision: "pending",
        status: "reviewing",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return {
      outcome: "staged",
      staged: {
        idempotencyKey: event.idempotencyKey,
        captureId: id,
        platform: event.platform,
        facts,
        categoryRuleSource,
        duplicateStatus: duplicate.status,
        orderContext: isPaymentPageParser(event.parserId)
          ? (event.orderContext?.pages ?? null)
          : null,
        orderDetailsAttempted: false,
      },
    };
  }

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
      const row = getRow(userId, item.captureId);
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
          ...(duplicate
            ? {
                warnings: duplicate.reason ? [duplicate.reason] : [],
                duplicateStatus: duplicate.status,
                duplicateTransactionId: duplicate.transactionId,
                duplicateAssessmentDigest:
                  duplicate.status === "possible_duplicate"
                    ? duplicateAssessmentDigest(
                        toDuplicateAssessment(duplicate),
                      )
                    : null,
              }
            : {}),
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
      const row = getRow(userId, item.captureId);
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

  // 可信商户：同一规范商户已有足够数量未修正（revisionNumber 保持 1）、
  // 未作废的自动入账交易时，自动入账上限放宽到可信上限。
  function isTrustedMerchant(userId: string, merchantName: string | null) {
    const normalized = normalizeMerchantName(merchantName);
    if (!normalized) return false;
    const rows = database
      .select({ merchantName: transactions.merchantName })
      .from(notificationCaptures)
      .innerJoin(
        transactions,
        eq(notificationCaptures.resultTransactionId, transactions.id),
      )
      .where(
        and(
          eq(notificationCaptures.userId, userId),
          eq(notificationCaptures.resultCode, "AUTO_POSTED"),
          eq(transactions.revisionNumber, 1),
          isNull(transactions.voidedAt),
        ),
      )
      .all();
    const proven = rows.filter(
      (row) => normalizeMerchantName(row.merchantName) === normalized,
    ).length;
    return proven >= TRUSTED_MERCHANT_MIN_AUTO_POSTS;
  }

  // 通知自动入账授权：该平台已授权时，确定重复的候选在接收时直接关联既有
  // 正式交易（结果码 AUTO_SKIPPED_DUPLICATE）；候选唯一且金额不超过上限
  // （可信商户放宽到可信上限）时直接确认入账（结果码 AUTO_POSTED）。
  // 疑似重复、超限与未授权平台的候选保持人工审核。
  function finalizeAutomation(userId: string, item: StagedCapture) {
    const settings = getSettings(userId);
    const capture = getRow(userId, item.captureId);
    if (!capture) return;
    const notificationField = autoPostFieldForPlatform[item.platform];
    if (isPaymentPageParser(capture.parserId)
      ? !settings.autoPostPaymentPages
      : !notificationField || !settings[notificationField]) return;

    if (item.duplicateStatus === "duplicate") {
      const confirmation = confirmParsedOn(database, userId, item.captureId, {
        decision: "post",
      });
      if (
        confirmation.status === "completed" &&
        confirmation.outcome.outcome === "duplicate"
      ) {
        database
          .update(notificationCaptures)
          .set({
            resultCode: "AUTO_SKIPPED_DUPLICATE",
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(notificationCaptures.id, item.captureId),
              eq(notificationCaptures.userId, userId),
            ),
          )
          .run();
      }
      return;
    }

    if (item.duplicateStatus !== "unique") return;
    const cap = isTrustedMerchant(userId, item.facts.merchantName)
      ? settings.autoPostTrustedMaxAmountMinor
      : settings.autoPostMaxAmountMinor;
    if (item.facts.amountMinor > cap) return;
    const confirmation = confirmParsedOn(database, userId, item.captureId, {
      decision: "post",
    });
    if (
      confirmation.status === "completed" &&
      confirmation.outcome.outcome === "posted"
    ) {
      database
        .update(notificationCaptures)
        .set({
          resultCode: "AUTO_POSTED",
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(notificationCaptures.id, item.captureId),
            eq(notificationCaptures.userId, userId),
          ),
        )
        .run();
    }
  }

  /**
   * `locale` is the language of the uploading device (its Accept-Language):
   * generated descriptions, payment methods and AI reasons are written in it.
   */
  async function ingest(
    userId: string,
    rawInput: unknown,
    locale: Locale = defaultLocale,
  ) {
    const batch = notificationCaptureBatchSchema.parse(rawInput);
    const staged = batch.events.map((event) => ingestOne(userId, event, locale));
    const accepted = staged.flatMap((entry) =>
      entry.outcome === "staged" ? [entry.staged] : [],
    );
    // The candidates are already stored. Categorization and automatic posting are best effort:
    // a failure here must leave them reviewable and still acknowledge the upload, because a
    // retried upload is answered "already accepted" and would never be automated again.
    try {
      await enrichWithOrderDetails(userId, accepted, locale);
    } catch (error) {
      console.error(
        "Notification capture order details failed",
        error instanceof Error ? error.name : "unknown",
      );
    }
    try {
      await enrichWithAiCategories(userId, accepted, locale);
    } catch (error) {
      console.error(
        "Notification capture AI categorization failed",
        error instanceof Error ? error.name : "unknown",
      );
    }
    for (const item of accepted) {
      try {
        finalizeAutomation(userId, item);
      } catch (error) {
        console.error(
          "Notification capture automation failed",
          error instanceof Error ? error.name : "unknown",
        );
      }
    }
    return {
      items: staged.map((entry) => {
        if (entry.outcome !== "staged") return entry.result;
        const row = getRow(userId, entry.staged.captureId)!;
        return {
          idempotencyKey: entry.staged.idempotencyKey,
          status: "accepted" as const,
          captureId: entry.staged.captureId,
          reviewStatus: row.status,
          // Lets the device say whether a completed capture was posted or linked to an existing transaction.
          resultCode: row.resultCode ?? null,
        };
      }),
    };
  }

  function list(userId: string, rawQuery: unknown) {
    const query = notificationCaptureListQuerySchema.parse(rawQuery);
    const statusCondition =
      query.status === "all"
        ? undefined
        : eq(notificationCaptures.status, query.status);
    const where = and(eq(notificationCaptures.userId, userId), statusCondition);
    const rows = database
      .select()
      .from(notificationCaptures)
      .where(where)
      .orderBy(desc(notificationCaptures.createdAt), desc(notificationCaptures.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .all();
    const total = Number(
      database
        .select({ value: count() })
        .from(notificationCaptures)
        .where(where)
        .get()?.value ?? 0,
    );
    const pendingCount = Number(
      database
        .select({ value: count() })
        .from(notificationCaptures)
        .where(
          and(
            eq(notificationCaptures.userId, userId),
            eq(notificationCaptures.status, "reviewing"),
          ),
        )
        .get()?.value ?? 0,
    );
    return {
      items: rows.map((row) => {
        if (row.status === "completed") return project(row);
        const duplicate = deduplicate(userId, row.platform, parseFacts(row.normalizedData));
        return { ...project(row), duplicateStatus: duplicate.status,
          duplicateTransactionId: duplicate.transactionId,
          duplicateAssessmentDigest: duplicate.status === "possible_duplicate" ? duplicateAssessmentDigest(toDuplicateAssessment(duplicate)) : null,
          warnings: duplicate.reason ? [duplicate.reason] : [],
        };
      }),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
      pendingCount,
    };
  }

  function edit(userId: string, captureId: string, rawInput: unknown) {
    const input = notificationCaptureEditSchema.parse(rawInput);
    const current = getRow(userId, captureId);
    if (!current) notFound();
    if (current.status !== "reviewing") {
      throw new NotificationCaptureServiceError(
        "NOTIFICATION_CAPTURE_NOT_EDITABLE",
        "Completed notification candidates cannot be edited",
        409,
      );
    }
    assertLedgerCategory(database, userId, input.categoryId, "expense");
    const category =
      input.categoryId === null
        ? categorization.suggest({
            userId,
            type: "expense",
            merchantName: input.merchantName,
            description: input.description,
          }).categoryId
        : input.categoryId;
    const facts = ledgerFactsSchema.parse({
      type: "expense",
      amountMinor: input.amountMinor,
      currency: "CNY",
      merchantName: input.merchantName,
      description: input.description,
      categoryId: category,
      transactionTime: input.transactionTime,
      paymentMethod: input.paymentMethod,
    });
    const fieldOrigins: FieldOrigins = {
      merchantName: "manual_edit",
      description: "manual_edit",
      paymentMethod: "manual_edit",
      categoryId:
        input.categoryId === null ? "categorization_rule" : "manual_edit",
    };
    const duplicate = deduplicate(userId, current.platform, facts);
    const assessment = toDuplicateAssessment(duplicate);
    database
      .update(notificationCaptures)
      .set({
        normalizedData: facts,
        fieldOrigins,
        validationErrors: [],
        warnings: duplicate.reason ? [duplicate.reason] : [],
        duplicateStatus: duplicate.status,
        duplicateTransactionId: duplicate.transactionId,
        duplicateAssessmentDigest:
          duplicate.status === "possible_duplicate"
            ? duplicateAssessmentDigest(assessment)
            : null,
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
    return get(userId, captureId);
  }

  function confirm(userId: string, captureId: string, rawInput: unknown) {
    return confirmParsed(userId, captureId, rawInput);
  }

  function confirmMany(userId: string, rawInput: unknown) {
    const input = notificationCaptureBulkConfirmSchema.parse(rawInput);
    return database.transaction((tx) => {
      const source = tx as unknown as Database;
      const outcomes = input.items.map((item) => {
        const current = getRowFrom(source, userId, item.id);
        if (!current) notFound();
        if (current.confirmationVersion !== item.version ||
            (current.status !== "completed" && deduplicate(userId, current.platform, parseFacts(current.normalizedData)).status !== "unique")) {
          throw new NotificationCaptureServiceError("BATCH_REVIEW_REQUIRED", "A selected candidate changed or needs duplicate review. Nothing in this batch was posted", 409);
        }
        const result = confirmParsedOn(source, userId, item.id, { decision: "post" });
        if (result.status !== "completed") {
          throw new NotificationCaptureServiceError("BATCH_REVIEW_REQUIRED", "A selected candidate now needs duplicate review. Nothing in this batch was posted", 409);
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
      const current = getRowFrom(source, userId, captureId);
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
      const duplicate = createDeduplicationService(source).check(userId, {
        type: facts.type,
        amountMinor: facts.amountMinor,
        currency: facts.currency,
        merchantName: facts.merchantName,
        description: facts.description,
        transactionTime: facts.transactionTime,
        source: current.platform,
        platformTransactionId: null,
      });
      const assessment = toDuplicateAssessment(duplicate);
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
          warnings: duplicate.reason ? [duplicate.reason] : [],
          duplicateStatus: duplicate.status,
          duplicateTransactionId: duplicate.transactionId,
          duplicateAssessmentDigest:
            duplicate.status === "possible_duplicate"
              ? duplicateAssessmentDigest(assessment)
              : null,
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
    const current = getRow(userId, captureId);
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
    const assessment = toDuplicateAssessment(duplicate);
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
        warnings: duplicate.reason ? [duplicate.reason] : [],
        duplicateStatus: duplicate.status,
        duplicateTransactionId: duplicate.transactionId,
        duplicateAssessmentDigest:
          duplicate.status === "possible_duplicate"
            ? duplicateAssessmentDigest(assessment)
            : null,
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
    ingest,
    list,
    get,
    getSettings,
    updateSettings,
    edit,
    confirm,
    quickConfirm,
    confirmMany,
    confirmBillEnrichment,
  };
}

export const notificationCaptureService = createNotificationCaptureService();
export { NotificationCaptureServiceError } from "@/services/notification-capture-service/error";
export {
  notificationCaptureBatchSchema,
  notificationCaptureBulkConfirmSchema,
  notificationCaptureConfirmSchema,
  notificationCaptureEditSchema,
  notificationCaptureListQuerySchema,
  notificationCaptureQuickConfirmSchema,
  notificationCaptureSettingsInputSchema,
} from "@/services/notification-capture-service/schema";
