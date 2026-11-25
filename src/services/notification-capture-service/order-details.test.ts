import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabase } from "@/db/client";
import {
  categories,
  merchantCategoryRules,
  notificationCaptures,
  transactionRevisions,
  transactions,
  users,
} from "@/db/schema";
import { normalizeMerchantName } from "@/lib/merchant";
import type {
  AiCategorizationRuntime,
  AiCategoryBatchInput,
  AiCategoryResult,
  OrderDetailsInput,
  OrderDetailsResult,
} from "@/services/ai-categorization-service";
import { createNotificationCaptureService } from "@/services/notification-capture-service";
import { createTransactionService } from "@/services/transaction-service";

type Ingested = { status: string; captureId?: string; reviewStatus?: string; resultCode?: string | null };

describe("order details on shopping-app payment candidates", () => {
  let database: ReturnType<typeof createDatabase>;

  const postedAt = "2026-11-20T02:32:00.000Z";
  const pages = [
    {
      source: "node" as const,
      lines: [
        "收货人 张三 13800001111",
        "晨光文具旗舰店",
        "晨光中性笔 0.5mm 黑色 按动式",
        "已选: 12支装",
        "¥18.80",
        "×2",
        "猜你喜欢 得力订书机 ¥9.90",
        "提交订单",
      ],
    },
  ];
  const pens: OrderDetailsResult = {
    shopName: "晨光文具旗舰店",
    items: [{ name: "晨光中性笔 0.5mm 黑色", spec: "12支装", quantity: 2, price: 18.8 }],
    categoryId: "stationery-a",
    confidence: 0.95,
    ambiguous: false,
    reason: "stationery",
  };

  function shoppingEvent(overrides: Record<string, unknown> = {}) {
    return {
      idempotencyKey: "a".repeat(64),
      platform: "taobao",
      sourcePackage: "com.taobao.taobao",
      postedAt,
      parserId: "taobao_payment_page_v1",
      parserVersion: 1,
      evidenceDigest: "b".repeat(64),
      confidenceBasisPoints: 9_000,
      facts: { amountMinor: 3_760, merchantName: null },
      orderContext: { pages },
      ...overrides,
    };
  }

  function runtime(provider: {
    extractOrderDetails?: (input: OrderDetailsInput) => Promise<OrderDetailsResult>;
    classifyBatch?: (input: AiCategoryBatchInput) => Promise<AiCategoryResult[]>;
  }): AiCategorizationRuntime {
    return {
      provider: {
        name: "openai-compatible",
        model: "stub-model",
        enabled: true,
        sendsDataToThirdParty: false,
        classifyBatch: provider.classifyBatch ?? (async () => []),
        ...(provider.extractOrderDetails
          ? { extractOrderDetails: provider.extractOrderDetails }
          : {}),
      },
      autoThreshold: 0.85,
      batchSize: 20,
      configurationFingerprint: "stub-fingerprint",
      metadata: {
        mode: "local",
        providerLabel: "stub",
        configured: true,
        enabled: true,
        sendsDataToThirdParty: false,
        model: "stub-model",
        disclosure: "",
        retentionPolicy: "",
      },
    };
  }

  async function ingestOne(
    service: ReturnType<typeof createNotificationCaptureService>,
    event: unknown,
    locale: "en" | "zh" = "zh",
  ) {
    return (await service.ingest("user-a", { events: [event] }, locale)).items[0] as Ingested;
  }

  beforeEach(() => {
    database = createDatabase(":memory:");
    migrate(database.db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    const now = "2026-11-20T00:00:00.000Z";
    database.db
      .insert(users)
      .values({
        id: "user-a",
        email: "a@example.com",
        passwordHash: "test",
        displayName: "A",
        timezone: "Asia/Shanghai",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(categories)
      .values(
        [
          { id: "other-a", name: "Other" },
          { id: "stationery-a", name: "文具" },
          { id: "gifts-a", name: "礼物" },
        ].map((category, index) => ({
          ...category,
          userId: "user-a",
          kind: "expense" as const,
          icon: "Tags",
          color: "#777777",
          isSystem: true,
          sortOrder: index,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .run();
  });

  afterEach(() => database.sqlite.close());

  it("names an automatically posted payment after its goods in the first revision", async () => {
    const extract = vi.fn(async (input: OrderDetailsInput) => {
      void input;
      return pens;
    });
    const classify = vi.fn(async () => []);
    const service = createNotificationCaptureService(
      database.db,
      runtime({ extractOrderDetails: extract, classifyBatch: classify }),
    );
    service.updateSettings("user-a", { autoPostPaymentPages: true });

    const item = await ingestOne(service, shoppingEvent());

    expect(item).toMatchObject({ status: "accepted", reviewStatus: "completed", resultCode: "AUTO_POSTED" });
    expect(extract).toHaveBeenCalledTimes(1);
    expect(extract.mock.calls[0]![0]).toMatchObject({ platform: "taobao", amountMinor: 3_760, locale: "zh" });
    expect(classify).not.toHaveBeenCalled();

    const posted = database.db.select().from(transactions).all();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      merchantName: "晨光文具旗舰店",
      description: "晨光中性笔 0.5mm 黑色",
      categoryId: "stationery-a",
      revisionNumber: 1,
    });
    expect(database.db.select().from(transactionRevisions).all()).toHaveLength(1);

    const capture = service.get("user-a", item.captureId!);
    expect(capture.fieldOrigins).toMatchObject({
      merchantName: "ai_suggestion",
      description: "ai_suggestion",
      categoryId: "ai_suggestion",
    });
    const details = {
      shopName: "晨光文具旗舰店",
      items: [{ name: "晨光中性笔 0.5mm 黑色", spec: "12支装", quantity: 2, priceMinor: 1_880 }],
    };
    expect(capture.orderDetails).toEqual(details);

    const reader = createTransactionService(database.db);
    expect(reader.get("user-a", posted[0]!.id)?.orderDetails).toEqual(details);
    expect(reader.list("user-a")[0]?.orderDetails).toEqual(details);
    expect(
      reader.listPage("user-a", { page: 1, limit: 20 }).items[0]?.orderDetails,
    ).toEqual(details);
  });

  it("stores none of the uploaded page text", async () => {
    const service = createNotificationCaptureService(
      database.db,
      runtime({ extractOrderDetails: async () => pens }),
    );
    const item = await ingestOne(service, shoppingEvent());
    const stored = JSON.stringify(
      database.db.select().from(notificationCaptures).all(),
    );
    expect(service.get("user-a", item.captureId!).orderDetails).not.toBeNull();
    expect(stored).not.toContain("张三");
    expect(stored).not.toContain("13800001111");
    expect(stored).not.toContain("得力订书机");
  });

  it("summarises several goods and leaves other transactions without details", async () => {
    const service = createNotificationCaptureService(
      database.db,
      runtime({
        extractOrderDetails: async () => ({
          ...pens,
          items: [
            ...pens.items,
            { name: "得力订书机", spec: null, quantity: null, price: null },
          ],
        }),
      }),
    );
    const item = await ingestOne(service, shoppingEvent());
    expect(service.get("user-a", item.captureId!).description).toBe(
      "晨光中性笔 0.5mm 黑色等2件",
    );

    const english = await ingestOne(
      service,
      shoppingEvent({ idempotencyKey: "c".repeat(64), postedAt: "2026-11-20T05:00:00.000Z" }),
      "en",
    );
    expect(service.get("user-a", english.captureId!).description).toBe(
      "晨光中性笔 0.5mm 黑色 and 1 more",
    );

    const plain = await ingestOne(
      service,
      shoppingEvent({
        idempotencyKey: "d".repeat(64),
        postedAt: "2026-11-20T07:00:00.000Z",
        orderContext: undefined,
      }),
    );
    expect(service.get("user-a", plain.captureId!)).toMatchObject({
      description: "淘宝支付成功页",
      orderDetails: null,
    });
  });

  it("keeps only what the page text supports", async () => {
    const service = createNotificationCaptureService(
      database.db,
      runtime({
        extractOrderDetails: async () => ({
          shopName: "华为官方旗舰店",
          items: [
            { name: "华为 Mate 手机", spec: null, quantity: 1, price: 4_999 },
            { name: "晨光中性笔", spec: "红色 3支装", quantity: 2, price: 5.5 },
          ],
          categoryId: "stationery-a",
          confidence: 0.99,
          ambiguous: false,
          reason: "made up",
        }),
      }),
    );
    const item = await ingestOne(service, shoppingEvent());
    const capture = service.get("user-a", item.captureId!);
    expect(capture.orderDetails).toEqual({
      shopName: null,
      items: [{ name: "晨光中性笔", spec: null, quantity: 2, priceMinor: null }],
    });
    expect(capture.merchantName).toBeNull();
    expect(capture.fieldOrigins.merchantName).toBe("parser");
  });

  it("records the payment unchanged when the model fails or finds nothing", async () => {
    const classify = vi.fn(async () => []);
    const failing = createNotificationCaptureService(
      database.db,
      runtime({
        extractOrderDetails: async () => {
          throw new Error("down");
        },
        classifyBatch: classify,
      }),
    );
    failing.updateSettings("user-a", { autoPostPaymentPages: true });
    const failed = await ingestOne(failing, shoppingEvent());
    expect(failed).toMatchObject({ status: "accepted", resultCode: "AUTO_POSTED" });
    expect(failing.get("user-a", failed.captureId!)).toMatchObject({
      description: "淘宝支付成功页",
      merchantName: null,
      orderDetails: null,
    });
    // The device is waiting: a candidate the model was asked about is not sent again.
    expect(classify).not.toHaveBeenCalled();

    const empty = createNotificationCaptureService(
      database.db,
      runtime({
        extractOrderDetails: async () => ({
          ...pens,
          items: [{ name: "完全不存在的东西", spec: null, quantity: null, price: null }],
        }),
      }),
    );
    const nothing = await ingestOne(
      empty,
      shoppingEvent({ idempotencyKey: "c".repeat(64), postedAt: "2026-11-20T05:00:00.000Z" }),
    );
    expect(empty.get("user-a", nothing.captureId!)).toMatchObject({
      description: "淘宝支付成功页",
      orderDetails: null,
    });
  });

  it("accepts a payment whose order context is malformed, without its items", async () => {
    const extract = vi.fn(async () => pens);
    const service = createNotificationCaptureService(
      database.db,
      runtime({ extractOrderDetails: extract }),
    );
    const malformed = [
      { pages: [] },
      { pages: [{ source: "camera", lines: ["x"] }] },
      { pages: [{ source: "node", lines: ["x".repeat(241)] }] },
      { pages: Array.from({ length: 5 }, () => ({ source: "node", lines: ["x"] })) },
      "text",
      null,
    ];
    for (const [index, orderContext] of malformed.entries()) {
      const item = await ingestOne(
        service,
        shoppingEvent({
          idempotencyKey: String(index).repeat(64),
          postedAt: `2026-11-20T0${index}:00:00.000Z`,
          orderContext,
        }),
      );
      expect(item).toMatchObject({ status: "accepted", reviewStatus: "reviewing" });
    }
    expect(extract).not.toHaveBeenCalled();
  });

  it("only reads order pages for payment-page candidates of an enabled model", async () => {
    const extract = vi.fn(async () => pens);
    const service = createNotificationCaptureService(
      database.db,
      runtime({ extractOrderDetails: extract }),
    );
    await ingestOne(service, {
      ...shoppingEvent(),
      platform: "alipay",
      sourcePackage: "com.eg.android.AlipayGphone",
      parserId: "alipay-payment-success",
    });
    expect(extract).not.toHaveBeenCalled();

    const disabled = runtime({ extractOrderDetails: extract });
    const off = createNotificationCaptureService(database.db, {
      ...disabled,
      provider: { ...disabled.provider, enabled: false },
    });
    const item = await ingestOne(
      off,
      shoppingEvent({ idempotencyKey: "c".repeat(64), postedAt: "2026-11-20T05:00:00.000Z" }),
    );
    expect(item).toMatchObject({ status: "accepted" });
    expect(extract).not.toHaveBeenCalled();
  });

  it("falls back to plain categorization when the provider cannot read order pages", async () => {
    const classify = vi.fn(async (input: AiCategoryBatchInput) =>
      input.items.map((entry) => ({
        itemRef: entry.itemRef,
        categoryId: "gifts-a",
        confidence: 0.95,
        ambiguous: false,
        reason: "stub",
      })),
    );
    const service = createNotificationCaptureService(
      database.db,
      runtime({ classifyBatch: classify }),
    );
    // English so that no local keyword matches the default description.
    const item = await ingestOne(service, shoppingEvent(), "en");
    expect(classify).toHaveBeenCalledTimes(1);
    expect(service.get("user-a", item.captureId!)).toMatchObject({
      categoryId: "gifts-a",
      orderDetails: null,
    });
  });

  it("holds a payment for review when its shop makes it a possible duplicate", async () => {
    const service = createNotificationCaptureService(
      database.db,
      runtime({ extractOrderDetails: async () => pens }),
    );
    service.updateSettings("user-a", { autoPostAlipay: true, autoPostPaymentPages: true });
    const statement = await ingestOne(service, {
      ...shoppingEvent({ idempotencyKey: "c".repeat(64), orderContext: undefined }),
      platform: "alipay",
      sourcePackage: "com.eg.android.AlipayGphone",
      parserId: "alipay-payment-success",
      postedAt: "2026-11-20T02:30:00.000Z",
      facts: { amountMinor: 3_760, merchantName: "晨光文具旗舰店" },
    });
    expect(statement).toMatchObject({ resultCode: "AUTO_POSTED" });

    // Two minutes apart and merchantless it would be unique; the shop name matches the earlier payment.
    const item = await ingestOne(service, shoppingEvent());
    expect(item).toMatchObject({ status: "accepted", reviewStatus: "reviewing" });
    expect(service.get("user-a", item.captureId!)).toMatchObject({
      duplicateStatus: "possible_duplicate",
      merchantName: "晨光文具旗舰店",
    });
    expect(database.db.select().from(transactions).all()).toHaveLength(1);
  });

  it("prefers a category the user taught for the shop over the model's", async () => {
    const now = "2026-11-20T00:00:00.000Z";
    database.db
      .insert(merchantCategoryRules)
      .values({
        id: "rule-a",
        userId: "user-a",
        categoryId: "gifts-a",
        normalizedMerchantName: normalizeMerchantName("晨光文具旗舰店")!,
        matchType: "exact",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const service = createNotificationCaptureService(
      database.db,
      runtime({ extractOrderDetails: async () => pens }),
    );
    const item = await ingestOne(service, shoppingEvent());
    const capture = service.get("user-a", item.captureId!);
    expect(capture.categoryId).toBe("gifts-a");
    expect(capture.fieldOrigins.categoryId).toBe("categorization_rule");
  });

  it("keeps the rule category when the model is unsure of one", async () => {
    const service = createNotificationCaptureService(
      database.db,
      runtime({
        extractOrderDetails: async () => ({ ...pens, confidence: 0.4 }),
      }),
    );
    const before = await ingestOne(
      service,
      shoppingEvent({ idempotencyKey: "c".repeat(64), postedAt: "2026-11-20T05:00:00.000Z", orderContext: undefined }),
    );
    const item = await ingestOne(service, shoppingEvent());
    const capture = service.get("user-a", item.captureId!);
    expect(capture.orderDetails).not.toBeNull();
    expect(capture.categoryId).toBe(service.get("user-a", before.captureId!).categoryId);
    expect(capture.fieldOrigins.categoryId).toBe("categorization_rule");
  });
});
