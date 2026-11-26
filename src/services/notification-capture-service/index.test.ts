import { readFileSync } from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import {
  categories,
  notificationCaptures,
  transactionRevisions,
  transactions,
  users,
} from "@/db/schema";
import {
  createNotificationCaptureService,
  NotificationCaptureServiceError,
} from "@/services/notification-capture-service";
import type {
  AiCategorizationRuntime,
  AiCategoryBatchInput,
  AiCategoryResult,
} from "@/services/ai-categorization-service";

type AcceptedIngestItem = Extract<
  Awaited<
    ReturnType<ReturnType<typeof createNotificationCaptureService>["ingest"]>
  >["items"][number],
  { captureId: string }
>;

describe("notification capture service", () => {
  let database: ReturnType<typeof createDatabase>;
  let service: ReturnType<typeof createNotificationCaptureService>;

  const postedAt = "2026-07-27T04:30:00.000Z";

  function event(
    overrides: Partial<{
      idempotencyKey: string;
      evidenceDigest: string;
      platform: "alipay" | "wechat" | "cmb" | "taobao" | "pinduoduo" | "jd" | "pupu" | "xianyu";
      sourcePackage: string;
      postedAt: string;
      amountMinor: number;
      merchantName: string | null;
      parserId: string;
      parserVersion: number;
    }> = {},
  ) {
    const platform = overrides.platform ?? "alipay";
    return {
      idempotencyKey: overrides.idempotencyKey ?? "a".repeat(64),
      platform,
      sourcePackage:
        overrides.sourcePackage ??
        {
          alipay: "com.eg.android.AlipayGphone",
          wechat: "com.tencent.mm",
          cmb: "cmb.pb",
          taobao: "com.taobao.taobao",
          pinduoduo: "com.xunmeng.pinduoduo",
          jd: "com.jingdong.app.mall",
          pupu: "com.pupumall.customer",
          xianyu: "com.taobao.idlefish",
        }[platform],
      postedAt: overrides.postedAt ?? postedAt,
      parserId:
        overrides.parserId ??
        (platform === "cmb" ? "cmb_debit_v1" : `${platform}-payment-success`),
      parserVersion: overrides.parserVersion ?? 1,
      evidenceDigest: overrides.evidenceDigest ?? "b".repeat(64),
      confidenceBasisPoints: 9_500,
      facts: {
        amountMinor: overrides.amountMinor ?? 1_880,
        merchantName: Object.prototype.hasOwnProperty.call(
          overrides,
          "merchantName",
        )
          ? (overrides.merchantName ?? null)
          : "Mountain Cafe",
      },
    };
  }

  beforeEach(() => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    const now = "2026-07-27T00:00:00.000Z";
    database.db
      .insert(users)
      .values([
        {
          id: "user-a",
          email: "a@example.com",
          passwordHash: "test",
          displayName: "A",
          timezone: "Asia/Shanghai",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "user-b",
          email: "b@example.com",
          passwordHash: "test",
          displayName: "B",
          timezone: "Asia/Shanghai",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    database.db
      .insert(categories)
      .values([
        {
          id: "other-a",
          userId: "user-a",
          name: "Other",
          kind: "expense",
          icon: "Tags",
          color: "#777777",
          isSystem: true,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "other-b",
          userId: "user-b",
          name: "Other",
          kind: "expense",
          icon: "Tags",
          color: "#777777",
          isSystem: true,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    service = createNotificationCaptureService(database.db);
  });

  afterEach(() => database.sqlite.close());

  it("does not auto-post repeated merchantless notifications with different delivery times", async () => {
    service.updateSettings("user-a", { autoPostAlipay: true });
    await service.ingest("user-a", { events: [event({ merchantName: null })] });
    const repeat = await service.ingest("user-a", {
      events: [event({
        idempotencyKey: "c".repeat(64),
        merchantName: null,
        postedAt: "2026-07-27T04:30:02.000Z",
      })],
    });
    expect(database.db.select().from(transactions).all()).toHaveLength(1);
    expect(repeat.items[0]).toMatchObject({ reviewStatus: "reviewing" });
    expect(service.list("user-a", {}).items[0]).toMatchObject({
      duplicateStatus: "possible_duplicate",
    });
  });

  it("rechecks same-batch merchantless captures before each automatic posting", async () => {
    service.updateSettings("user-a", { autoPostAlipay: true });
    const result = await service.ingest("user-a", { events: [
      event({ merchantName: null }),
      event({ idempotencyKey: "c".repeat(64), merchantName: null, postedAt: "2026-07-27T04:30:02.000Z" }),
    ] });
    expect(database.db.select().from(transactions).all()).toHaveLength(1);
    expect(result.items.map(item => "reviewStatus" in item && item.reviewStatus)).toEqual(["completed", "reviewing"]);
  });

  it("keeps payment pages separately authorized and preserves page provenance on confirmation", async () => {
    service.updateSettings("user-a", { autoPostAlipay: true });
    const result = await service.ingest("user-a", {
      events: [event({ parserId: "alipay_payment_page_v1" })],
    });
    const item = result.items[0];
    expect(item).toMatchObject({ reviewStatus: "reviewing" });
    expect(database.db.select().from(transactions).all()).toHaveLength(0);
    if (!item || !("captureId" in item)) throw new Error("Missing capture");
    expect(service.get("user-a", item.captureId)).toMatchObject({
      captureMethod: "payment_page", description: "Alipay payment success page",
    });
    service.confirm("user-a", item.captureId, { decision: "post" });
    expect(database.db.select().from(transactionRevisions).get()?.provenanceSnapshot).toMatchObject({
      kind: "payment_page_capture", parserId: "alipay_payment_page_v1",
    });
  });

  it("registers on-device OCR page captures under their own parser identity and the page authorization", async () => {
    service.updateSettings("user-a", { autoPostWechat: true });
    const ocr = event({ platform: "wechat", parserId: "wechat_payment_page_ocr_v1", merchantName: null });
    const held = await service.ingest("user-a", { events: [ocr] });
    const item = held.items[0];
    expect(item).toMatchObject({ status: "accepted", reviewStatus: "reviewing" });
    if (!item || !("captureId" in item)) throw new Error("Missing capture");
    expect(service.get("user-a", item.captureId)).toMatchObject({
      captureMethod: "payment_page",
      parserId: "wechat_payment_page_ocr_v1",
      description: "WeChat payment success page (on-device OCR)",
    });

    service.updateSettings("user-a", { autoPostPaymentPages: true });
    const posted = await service.ingest("user-a", {
      events: [{ ...ocr, idempotencyKey: "d".repeat(64), postedAt: "2026-07-27T05:30:00.000Z", facts: { amountMinor: 4_321, merchantName: "Payee" } }],
    });
    expect(posted.items[0]).toMatchObject({ status: "accepted", reviewStatus: "completed" });
    expect(database.db.select().from(transactionRevisions).get()?.provenanceSnapshot).toMatchObject({
      kind: "payment_page_capture", parserId: "wechat_payment_page_ocr_v1",
    });
    const unknown = await service.ingest("user-a", {
      events: [{ ...ocr, idempotencyKey: "e".repeat(64), parserId: "wechat_payment_page_ocr_v2" }],
    });
    expect(unknown.items[0]).toMatchObject({ status: "rejected", code: "UNSUPPORTED_PARSER" });
  });

  it("accepts shopping-app payment pages only under their own package, page parser and the page authorization", async () => {
    const taobao = event({ platform: "taobao", parserId: "taobao_payment_page_ocr_v1", merchantName: null });
    const held = await service.ingest("user-a", { events: [taobao] });
    const item = held.items[0];
    expect(item).toMatchObject({ status: "accepted", reviewStatus: "reviewing" });
    if (!item || !("captureId" in item)) throw new Error("Missing capture");
    expect(service.get("user-a", item.captureId)).toMatchObject({
      platform: "taobao",
      captureMethod: "payment_page",
      description: "Taobao payment success page (on-device OCR)",
    });

    const rejected = await service.ingest("user-a", {
      events: [
        { ...taobao, idempotencyKey: "c".repeat(64), sourcePackage: "com.eg.android.AlipayGphone" },
        event({ idempotencyKey: "d".repeat(64), platform: "jd", parserId: "jd_payment_page_ocr_v1" }),
        event({ idempotencyKey: "e".repeat(64), platform: "pinduoduo", parserId: "pinduoduo-payment-success" }),
        event({ idempotencyKey: "2".repeat(64), platform: "taobao", parserId: "taobao_payment_page_ocr_v2" }),
        event({ idempotencyKey: "3".repeat(64), platform: "pupu", parserId: "pupu_payment_page_ocr_v1" }),
        event({ idempotencyKey: "5".repeat(64), platform: "xianyu", sourcePackage: "com.taobao.taobao", parserId: "xianyu_payment_page_v1" }),
        event({ idempotencyKey: "6".repeat(64), platform: "xianyu", parserId: "xianyu_payment_page_ocr_v2" }),
      ],
    });
    expect(rejected.items.map((entry) => "code" in entry && entry.code)).toEqual([
      "SOURCE_PACKAGE_MISMATCH",
      "UNSUPPORTED_PARSER",
      "UNSUPPORTED_PARSER",
      "UNSUPPORTED_PARSER",
      "UNSUPPORTED_PARSER",
      "SOURCE_PACKAGE_MISMATCH",
      "UNSUPPORTED_PARSER",
    ]);

    service.updateSettings("user-a", { autoPostPaymentPages: true });
    const posted = await service.ingest("user-a", {
      events: [
        event({ idempotencyKey: "f".repeat(64), platform: "jd", parserId: "jd_payment_page_v1", postedAt: "2026-07-27T06:30:00.000Z", amountMinor: 9_900, merchantName: null }),
        event({ idempotencyKey: "1".repeat(64), platform: "pinduoduo", parserId: "pinduoduo_payment_page_v1", postedAt: "2026-07-27T07:30:00.000Z", amountMinor: 2_350, merchantName: null }),
        event({ idempotencyKey: "4".repeat(64), platform: "pupu", parserId: "pupu_payment_page_v1", postedAt: "2026-07-27T08:30:00.000Z", amountMinor: 5_670, merchantName: null }),
        event({ idempotencyKey: "7".repeat(64), platform: "xianyu", parserId: "xianyu_payment_page_v1", postedAt: "2026-07-27T09:30:00.000Z", amountMinor: 3_450, merchantName: null }),
        event({ idempotencyKey: "8".repeat(64), platform: "xianyu", parserId: "xianyu_payment_page_ocr_v1", postedAt: "2026-07-27T10:30:00.000Z", amountMinor: 4_560, merchantName: null }),
      ],
    });
    expect(posted.items.map((entry) => "reviewStatus" in entry && entry.reviewStatus)).toEqual(["completed", "completed", "completed", "completed", "completed"]);
    expect(database.db.select().from(transactions).all().map((row) => row.source).sort()).toEqual(["jd", "pinduoduo", "pupu", "xianyu", "xianyu"]);
  });

  it("holds a shopping-app success page for review when the payment app already reported the same amount", async () => {
    service.updateSettings("user-a", { autoPostPaymentPages: true });
    const result = await service.ingest("user-a", {
      events: [
        event({ platform: "wechat", parserId: "wechat_payment_page_v1", merchantName: "Pinduoduo Merchant" }),
        event({ idempotencyKey: "c".repeat(64), platform: "pinduoduo", parserId: "pinduoduo_payment_page_v1", postedAt: "2026-07-27T04:30:06.000Z", merchantName: null }),
        event({ idempotencyKey: "d".repeat(64), platform: "alipay", parserId: "alipay_payment_page_v1", postedAt: "2026-07-27T05:30:00.000Z", amountMinor: 4_200, merchantName: "Seller" }),
        event({ idempotencyKey: "e".repeat(64), platform: "xianyu", parserId: "xianyu_payment_page_v1", postedAt: "2026-07-27T05:30:08.000Z", amountMinor: 4_200, merchantName: null }),
      ],
    });
    expect(result.items.map((entry) => "reviewStatus" in entry && entry.reviewStatus)).toEqual(["completed", "reviewing", "completed", "reviewing"]);
    expect(database.db.select().from(transactions).all()).toHaveLength(2);
  });

  it("allows separately authorized payment pages and ignores a replay of the same page session", async () => {
    service.updateSettings("user-a", { autoPostPaymentPages: true });
    const page = event({ platform: "wechat", parserId: "wechat_payment_page_v1" });
    await service.ingest("user-a", { events: [page] });
    const replay = await service.ingest("user-a", { events: [{ ...page, postedAt: "2026-07-27T04:30:02.000Z" }] });
    expect(replay.items[0]).toMatchObject({ status: "already_accepted", reviewStatus: "completed" });
    expect(database.db.select().from(transactions).all()).toHaveLength(1);
    expect(database.db.select().from(transactionRevisions).get()?.provenanceSnapshot.kind).toBe("payment_page_capture");
  });

  it("accepts a strict event idempotently and never stores raw notification text", async () => {
    const first = (await service.ingest("user-a", {
      events: [
        {
          ...event(),
          rawTitle: "Alipay",
          rawText: "Payment successful ￥18.80，Merchant: Mountain Cafe",
        },
      ],
    })) as { items: AcceptedIngestItem[] };
    const second = await service.ingest("user-a", { events: [event()] });

    expect(first.items[0]).toMatchObject({
      status: "accepted",
      reviewStatus: "reviewing",
    });
    expect(second.items[0]).toMatchObject({
      status: "already_accepted",
      captureId: first.items[0]?.captureId,
    });
    const rows = database.db.select().from(notificationCaptures).all();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain("Payment successful");
    expect(rows[0]?.normalizedData).toMatchObject({
      type: "expense",
      amountMinor: 1_880,
      currency: "CNY",
      merchantName: "Mountain Cafe",
      description: "Alipay payment notification",
      paymentMethod: "Alipay",
    });
  });

  it("writes generated descriptions and payment methods in the capture request's language", async () => {
    const result = (await service.ingest(
      "user-a",
      {
        events: [
          event(),
          event({ idempotencyKey: "c".repeat(64), platform: "cmb", postedAt: "2026-07-27T05:30:00.000Z" }),
          event({ idempotencyKey: "d".repeat(64), platform: "wechat", parserId: "wechat_payment_page_v1", postedAt: "2026-07-27T06:30:00.000Z" }),
          event({ idempotencyKey: "e".repeat(64), platform: "alipay", parserId: "alipay_payment_page_ocr_v1", postedAt: "2026-07-27T07:30:00.000Z" }),
        ],
      },
      "zh",
    )) as { items: AcceptedIngestItem[] };

    expect(result.items.map((item) => {
      const capture = service.get("user-a", item.captureId);
      return [capture.description, capture.paymentMethod];
    })).toEqual([
      ["支付宝支付通知", "支付宝"],
      ["招商银行扣费通知", "招商银行"],
      ["微信支付成功页", "微信"],
      ["支付宝支付成功页（本地识别）", "支付宝"],
    ]);
    // Merchant text comes from the notification and is never translated.
    expect(service.get("user-a", result.items[0]!.captureId).merchantName).toBe("Mountain Cafe");
  });

  it("deduplicates and trusts merchants across English and Chinese captures", async () => {
    service.updateSettings("user-a", { autoPostAlipay: true, autoPostMaxAmountMinor: 1_000 });
    for (let index = 0; index < 5; index += 1) {
      const staged = (await service.ingest(
        "user-a",
        { events: [event({ idempotencyKey: `${index}`.padStart(64, "0"), amountMinor: 500, postedAt: `2026-07-2${index}T04:30:00.000Z` })] },
        index % 2 ? "zh" : "en",
      )).items[0]! as AcceptedIngestItem;
      expect(staged.reviewStatus).toBe("completed");
    }
    expect(new Set(database.db.select().from(transactions).all().map((row) => row.paymentMethod)))
      .toEqual(new Set(["Alipay", "支付宝"]));

    const trusted = (await service.ingest(
      "user-a",
      { events: [event({ idempotencyKey: "6".padStart(64, "0"), amountMinor: 5_000, postedAt: "2026-07-28T04:30:00.000Z" })] },
      "zh",
    )).items[0]! as AcceptedIngestItem;
    expect(service.get("user-a", trusted.captureId).resultCode).toBe("AUTO_POSTED");

    // The same payment reported again, now by a Chinese-language device.
    const replay = (await service.ingest(
      "user-a",
      { events: [event({ idempotencyKey: "9".padStart(64, "0"), amountMinor: 500, postedAt: "2026-07-20T04:30:00.000Z" })] },
      "zh",
    )).items[0]! as AcceptedIngestItem;
    expect(service.get("user-a", replay.captureId)).toMatchObject({
      duplicateStatus: "duplicate",
      resultCode: "AUTO_SKIPPED_DUPLICATE",
    });
    expect(database.db.select().from(transactions).all()).toHaveLength(6);
  });

  it("rejects a package/platform mismatch per event without rejecting the batch", async () => {
    const result = await service.ingest("user-a", {
      events: [
        event({ sourcePackage: "com.tencent.mm" }),
        event({
          idempotencyKey: "c".repeat(64),
          evidenceDigest: "d".repeat(64),
          platform: "wechat",
        }),
      ],
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        status: "rejected",
        code: "SOURCE_PACKAGE_MISMATCH",
      }),
      expect.objectContaining({
        status: "accepted",
        reviewStatus: "reviewing",
      }),
    ]);
  });

  it("accepts current and previous parser identities and rejects unknown combinations per event", async () => {
    const result = await service.ingest("user-a", {
      events: [
        event({
          parserId: "alipay_success_v1",
          parserVersion: 1,
        }),
        event({
          idempotencyKey: "c".repeat(64),
          evidenceDigest: "d".repeat(64),
          parserId: "alipay_success_v2",
          parserVersion: 2,
        }),
        event({
          idempotencyKey: "e".repeat(64),
          evidenceDigest: "f".repeat(64),
          platform: "wechat",
          parserId: "wechat_success_v1",
          parserVersion: 1,
        }),
        event({
          idempotencyKey: "1".repeat(64),
          evidenceDigest: "2".repeat(64),
          platform: "cmb",
          parserId: "cmb_debit_v1",
          parserVersion: 1,
        }),
        event({
          idempotencyKey: "3".repeat(64),
          evidenceDigest: "4".repeat(64),
          parserId: "alipay_future_v99",
          parserVersion: 99,
        }),
      ],
    });

    expect(result.items.map((item) => item.status)).toEqual([
      "accepted",
      "accepted",
      "accepted",
      "accepted",
      "rejected",
    ]);
    expect(result.items[4]).toMatchObject({
      code: "UNSUPPORTED_PARSER",
      idempotencyKey: "3".repeat(64),
    });
  });

  it("accepts a CMB event with bank-specific normalized facts and source", async () => {
    const accepted = (await service.ingest("user-a", {
      events: [
        event({
          platform: "cmb",
          merchantName: null,
        }),
      ],
    })).items[0]! as AcceptedIngestItem;

    expect(accepted).toMatchObject({
      status: "accepted",
      reviewStatus: "reviewing",
    });
    expect(service.get("user-a", accepted.captureId!)).toMatchObject({
      platform: "cmb",
      sourcePackage: "cmb.pb",
      description: "CMB debit notification",
      paymentMethod: "China Merchants Bank",
    });

    service.confirm("user-a", accepted.captureId!, { decision: "post" });
    expect(database.db.select().from(transactions).get()).toMatchObject({
      source: "cmb",
      paymentMethod: "China Merchants Bank",
    });
  });

  it("confirms through the Ledger with notification provenance and platform source", async () => {
    const accepted = (await service.ingest("user-a", { events: [event()] })).items[0]! as AcceptedIngestItem;
    const result = service.confirm("user-a", accepted.captureId!, {
      decision: "post",
    });

    expect(result.status).toBe("completed");
    const transaction = database.db.select().from(transactions).get();
    expect(transaction).toMatchObject({
      userId: "user-a",
      source: "alipay",
      amountMinor: 1_880,
      recognitionConfidence: 9_500,
    });
    const revision = database.db.select().from(transactionRevisions).get();
    expect(revision?.provenanceSnapshot).toMatchObject({
      kind: "notification_capture",
      captureId: accepted.captureId,
      platform: "alipay",
      sourcePackage: "com.eg.android.AlipayGphone",
      evidenceDigest: "b".repeat(64),
    });
  });

  it("quick-confirms a missing-merchant capture with trimmed merchant input idempotently", async () => {
    const accepted = (await service.ingest("user-a", {
      events: [event({ merchantName: null })],
    })).items[0]! as AcceptedIngestItem;

    const first = service.quickConfirm("user-a", accepted.captureId!, {
      merchantName: "  Mountain Cafe  ",
    });
    const second = service.quickConfirm("user-a", accepted.captureId!, {
      merchantName: "Mountain Cafe",
    });

    expect(first).toMatchObject({
      status: "completed",
      capture: {
        merchantName: "Mountain Cafe",
        status: "completed",
      },
      outcome: { outcome: "posted" },
    });
    expect(second).toMatchObject({
      status: "completed",
      capture: {
        id: accepted.captureId,
        merchantName: "Mountain Cafe",
      },
    });
    expect(database.db.select().from(transactions).all()).toHaveLength(1);
  });

  it("exposes parser and quick-input field origins on notification candidates", async () => {
    const accepted = (await service.ingest("user-a", {
      events: [event({ merchantName: null })],
    })).items[0]! as AcceptedIngestItem;

    expect(service.get("user-a", accepted.captureId!)).toMatchObject({
      fieldOrigins: {
        merchantName: "parser",
        description: "system_default",
        paymentMethod: "system_default",
        categoryId: "categorization_rule",
      },
    });

    const confirmed = service.quickConfirm("user-a", accepted.captureId!, {
      merchantName: "Mountain Cafe",
    });
    expect(confirmed).toMatchObject({
      capture: {
        fieldOrigins: {
          merchantName: "quick_input",
          categoryId: "categorization_rule",
        },
      },
    });
  });

  it("marks missing historical field origins as unknown instead of inferring user input", async () => {
    const accepted = (await service.ingest("user-a", {
      events: [event()],
    })).items[0]! as AcceptedIngestItem;
    database.db
      .update(notificationCaptures)
      .set({
        fieldOrigins: {
          merchantName: "manual_edit",
        },
      })
      .where(eq(notificationCaptures.id, accepted.captureId!))
      .run();
    database.sqlite.exec(
      readFileSync(
        path.resolve(
          process.cwd(),
          "drizzle/0014_notification_field_origins.sql",
        ),
        "utf8",
      ),
    );

    expect(service.get("user-a", accepted.captureId!)).toMatchObject({
      merchantName: "Mountain Cafe",
      description: "Alipay payment notification",
      fieldOrigins: {
        merchantName: "manual_edit",
        description: "legacy_unknown",
        paymentMethod: "legacy_unknown",
        categoryId: "legacy_unknown",
      },
    });
  });

  it("requires merchant input only when the capture has no merchant", async () => {
    const missing = (await service.ingest("user-a", {
      events: [event({ merchantName: null })],
    })).items[0]! as AcceptedIngestItem;
    expect(() =>
      service.quickConfirm("user-a", missing.captureId!, {}),
    ).toThrowError(
      expect.objectContaining({
        code: "NOTIFICATION_CAPTURE_MERCHANT_REQUIRED",
        status: 422,
      }),
    );

    const known = (await service.ingest("user-a", {
      events: [
        event({
          idempotencyKey: "c".repeat(64),
          evidenceDigest: "d".repeat(64),
        }),
      ],
    })).items[0]! as AcceptedIngestItem;
    expect(service.quickConfirm("user-a", known.captureId!, {})).toMatchObject({
      status: "completed",
      capture: { merchantName: "Mountain Cafe" },
      outcome: { outcome: "posted" },
    });
  });

  it("keeps a quick-confirmed possible duplicate in review", async () => {
    const first = (await service.ingest("user-a", { events: [event()] })).items[0]! as AcceptedIngestItem;
    service.confirm("user-a", first.captureId!, { decision: "post" });
    const second = (await service.ingest("user-a", {
      events: [
        event({
          idempotencyKey: "c".repeat(64),
          evidenceDigest: "d".repeat(64),
          postedAt: "2026-07-27T04:32:00.000Z",
          merchantName: null,
        }),
      ],
    })).items[0]! as AcceptedIngestItem;

    expect(
      service.quickConfirm("user-a", second.captureId!, {
        merchantName: "Mountain Cafe",
      }),
    ).toMatchObject({
      status: "needs_review",
      capture: {
        status: "reviewing",
        duplicateStatus: "possible_duplicate",
      },
    });
    expect(database.db.select().from(transactions).all()).toHaveLength(1);
  });

  it("keeps an exact duplicate pending until an explicit quick confirmation", async () => {
    const first = (await service.ingest("user-a", { events: [event()] })).items[0]! as AcceptedIngestItem;
    service.confirm("user-a", first.captureId!, { decision: "post" });

    const duplicate = (await service.ingest("user-a", {
      events: [
        event({
          idempotencyKey: "c".repeat(64),
          evidenceDigest: "d".repeat(64),
        }),
      ],
    })).items[0]! as AcceptedIngestItem;

    expect(duplicate).toMatchObject({
      status: "accepted",
      reviewStatus: "reviewing",
    });
    expect(service.get("user-a", duplicate.captureId!)).toMatchObject({
      status: "reviewing",
      duplicateStatus: "duplicate",
      decision: "pending",
    });
    expect(database.db.select().from(transactions).all()).toHaveLength(1);

    expect(
      service.quickConfirm("user-a", duplicate.captureId!, {}),
    ).toMatchObject({
      status: "completed",
      outcome: { outcome: "duplicate" },
    });
    expect(database.db.select().from(transactions).all()).toHaveLength(1);
  });

  it("requires the current assessment digest before posting a possible duplicate", async () => {
    const first = (await service.ingest("user-a", { events: [event()] })).items[0]! as AcceptedIngestItem;
    service.confirm("user-a", first.captureId!, { decision: "post" });

    const possible = (await service.ingest("user-a", {
      events: [
        event({
          idempotencyKey: "c".repeat(64),
          evidenceDigest: "d".repeat(64),
          postedAt: "2026-07-27T04:32:00.000Z",
        }),
      ],
    })).items[0]! as AcceptedIngestItem;
    const pending = service.get("user-a", possible.captureId!);
    expect(pending.duplicateStatus).toBe("possible_duplicate");

    const withoutDigest = service.confirm("user-a", possible.captureId!, {
      decision: "post",
    });
    expect(withoutDigest.status).toBe("needs_review");
    const refreshed = service.get("user-a", possible.captureId!);
    const posted = service.confirm("user-a", possible.captureId!, {
      decision: "post",
      assessmentDigest: refreshed.duplicateAssessmentDigest!,
    });

    expect(posted.status).toBe("completed");
    expect(database.db.select().from(transactions).all()).toHaveLength(2);
  });

  it("recalculates category and duplicate assessment after editing", async () => {
    const accepted = (await service.ingest("user-a", { events: [event()] })).items[0]! as AcceptedIngestItem;
    const edited = service.edit("user-a", accepted.captureId!, {
      amountMinor: 2_500,
      merchantName: null,
      description: "Alipay payment notification",
      categoryId: null,
      transactionTime: "2026-07-27T05:00:00.000Z",
      paymentMethod: "Alipay",
    });

    expect(edited).toMatchObject({
      amountMinor: 2_500,
      merchantName: null,
      categoryId: "other-a",
      duplicateStatus: "unique",
      fieldOrigins: {
        merchantName: "manual_edit",
        description: "manual_edit",
        paymentMethod: "manual_edit",
        categoryId: "categorization_rule",
      },
    });
  });

  it("isolates candidates and category references by user", async () => {
    const accepted = (await service.ingest("user-a", { events: [event()] })).items[0]! as AcceptedIngestItem;

    expect(() => service.get("user-b", accepted.captureId!)).toThrow(
      NotificationCaptureServiceError,
    );
    expect(() =>
      service.edit("user-a", accepted.captureId!, {
        amountMinor: 1_880,
        merchantName: "Mountain Cafe",
        description: "Alipay payment notification",
        categoryId: "other-b",
        transactionTime: postedAt,
        paymentMethod: "Alipay",
      }),
    ).toThrow();
    expect(
      database.db
        .select()
        .from(notificationCaptures)
        .where(eq(notificationCaptures.userId, "user-b"))
        .all(),
    ).toHaveLength(0);
  });

  it("returns default auto-post settings and updates them per user", () => {
    expect(service.getSettings("user-a")).toEqual({
      autoPostAlipay: false,
      autoPostWechat: false,
      autoPostCmb: false,
      autoPostPaymentPages: false,
      autoPostMaxAmountMinor: 50_000,
      autoPostTrustedMaxAmountMinor: 500_000,
    });

    const updated = service.updateSettings("user-a", {
      autoPostAlipay: true,
      autoPostMaxAmountMinor: 20_000,
    });
    expect(updated).toEqual({
      autoPostAlipay: true,
      autoPostWechat: false,
      autoPostCmb: false,
      autoPostPaymentPages: false,
      autoPostMaxAmountMinor: 20_000,
      autoPostTrustedMaxAmountMinor: 500_000,
    });
    expect(service.getSettings("user-a")).toEqual(updated);
    expect(service.getSettings("user-b")).toEqual({
      autoPostAlipay: false,
      autoPostWechat: false,
      autoPostCmb: false,
      autoPostPaymentPages: false,
      autoPostMaxAmountMinor: 50_000,
      autoPostTrustedMaxAmountMinor: 500_000,
    });

    expect(() =>
      service.updateSettings("user-a", { autoPostMaxAmountMinor: -1 }),
    ).toThrow();
    expect(() =>
      service.updateSettings("user-a", { autoPostTrustedMaxAmountMinor: -1 }),
    ).toThrow();
    expect(() => service.updateSettings("user-a", {})).toThrow();
  });

  it("auto-posts a unique capture within the authorized platform and amount cap", async () => {
    service.updateSettings("user-a", { autoPostAlipay: true });

    const accepted = (await service.ingest("user-a", { events: [event()] })).items[0]! as AcceptedIngestItem;

    expect(accepted).toMatchObject({
      status: "accepted",
      reviewStatus: "completed",
    });
    const capture = service.get("user-a", accepted.captureId!);
    expect(capture).toMatchObject({
      status: "completed",
      resultCode: "AUTO_POSTED",
    });
    const transaction = database.db.select().from(transactions).get();
    expect(transaction).toMatchObject({
      userId: "user-a",
      source: "alipay",
      amountMinor: 1_880,
    });
    const revision = database.db.select().from(transactionRevisions).get();
    expect(revision?.provenanceSnapshot).toMatchObject({
      kind: "notification_capture",
      captureId: accepted.captureId,
    });
  });

  it("auto-posts a capture without merchant when authorized", async () => {
    service.updateSettings("user-a", { autoPostWechat: true });

    const accepted = (await service.ingest("user-a", {
      events: [event({ platform: "wechat", merchantName: null })],
    })).items[0]! as AcceptedIngestItem;

    expect(accepted.reviewStatus).toBe("completed");
    expect(
      database.db.select().from(transactions).all(),
    ).toHaveLength(1);
  });

  it("keeps reviewing when auto-post is disabled, over the cap, or duplicated", async () => {
    // 未授权平台保持人工审核
    const alipayDefault = (await service.ingest("user-a", {
      events: [event({ idempotencyKey: "1".repeat(64) })],
    })).items[0]! as AcceptedIngestItem;
    expect(alipayDefault.reviewStatus).toBe("reviewing");

    // 超过上限保持人工审核
    service.updateSettings("user-a", {
      autoPostAlipay: true,
      autoPostMaxAmountMinor: 1_000,
    });
    const overCap = (await service.ingest("user-a", {
      events: [
        event({ idempotencyKey: "2".repeat(64), amountMinor: 1_880 }),
      ],
    })).items[0]! as AcceptedIngestItem;
    expect(overCap.reviewStatus).toBe("reviewing");

    // 疑似重复保持人工审核（与已入账交易金额、商户相同且时间接近）
    service.updateSettings("user-a", { autoPostMaxAmountMinor: 50_000 });
    const posted = (await service.ingest("user-a", {
      events: [event({ idempotencyKey: "3".repeat(64) })],
    })).items[0]! as AcceptedIngestItem;
    expect(posted.reviewStatus).toBe("completed");
    const possibleDuplicate = (await service.ingest("user-a", {
      events: [
        event({
          idempotencyKey: "4".repeat(64),
          postedAt: "2026-07-27T04:32:00.000Z",
        }),
      ],
    })).items[0]! as AcceptedIngestItem;
    expect(possibleDuplicate.reviewStatus).toBe("reviewing");
    expect(
      service.get("user-a", possibleDuplicate.captureId!).duplicateStatus,
    ).toBe("possible_duplicate");
  });

  it("stays completed when an auto-posted capture is ingested again", async () => {
    service.updateSettings("user-a", { autoPostAlipay: true });
    await service.ingest("user-a", { events: [event()] });

    const again = (await service.ingest("user-a", { events: [event()] })).items[0]! as AcceptedIngestItem;

    expect(again).toMatchObject({
      status: "already_accepted",
      reviewStatus: "completed",
    });
    expect(database.db.select().from(transactions).all()).toHaveLength(1);
  });
  it.each([['alipay', 'cmb'], ['cmb', 'alipay'], ['wechat', 'cmb'], ['cmb', 'wechat']] as const)(
    'reviews a bank/payment pair in arrival order %s then %s without merchant evidence',
    async (firstPlatform, secondPlatform) => {
      service.updateSettings('user-a', { autoPostAlipay: true, autoPostWechat: true, autoPostCmb: true });
      (await service.ingest('user-a', { events: [event({ platform: firstPlatform, merchantName: null })] }) as { items: AcceptedIngestItem[] });
      const second = (await service.ingest('user-a', { events: [event({
        platform: secondPlatform, merchantName: null, idempotencyKey: 'c'.repeat(64),
        postedAt: '2026-07-27T04:30:10.000Z',
      })] }) as { items: AcceptedIngestItem[] }).items[0]!;
      expect(second.reviewStatus).toBe('reviewing');
      expect(database.db.select().from(transactions).all()).toHaveLength(1);
      const candidate = service.get('user-a', second.captureId!);
      expect(candidate.duplicateStatus).toBe('possible_duplicate');
      const confirmed = service.confirm('user-a', second.captureId!, {
        decision: 'post', assessmentDigest: candidate.duplicateAssessmentDigest,
      });
      expect(confirmed.status).toBe('completed');
      expect(database.db.select().from(transactions).all()).toHaveLength(2);
    },
  );

  it('does not automatically post a bank notice with a different merchant label', async () => {
    service.updateSettings('user-a', { autoPostAlipay: true, autoPostCmb: true });
    (await service.ingest('user-a', { events: [event()] }) as { items: AcceptedIngestItem[] });
    const second = (await service.ingest('user-a', { events: [event({
      platform: 'cmb', merchantName: 'Alipay debit', idempotencyKey: 'c'.repeat(64),
    })] }) as { items: AcceptedIngestItem[] }).items[0]!;
    expect(second.reviewStatus).toBe('reviewing');
  });

  it('keeps different amounts and distant bank payments eligible for automatic posting', async () => {
    service.updateSettings('user-a', { autoPostAlipay: true, autoPostCmb: true });
    (await service.ingest('user-a', { events: [event({ merchantName: null })] }) as { items: AcceptedIngestItem[] });
    for (const candidate of [
      event({ platform: 'cmb', amountMinor: 2000, merchantName: null, idempotencyKey: 'c'.repeat(64) }),
      event({ platform: 'cmb', postedAt: '2026-07-27T04:36:00.000Z', merchantName: null, idempotencyKey: 'd'.repeat(64) }),
    ]) {
      expect((await service.ingest('user-a', { events: [candidate] }) as { items: AcceptedIngestItem[] }).items[0]!.reviewStatus).toBe('completed');
    }
  });

  it('rolls back every posting when a selected batch contains a newly discovered duplicate', async () => {
    const first = (await service.ingest('user-a', { events: [event({ merchantName: null })] }) as { items: AcceptedIngestItem[] }).items[0]!;
    const second = (await service.ingest('user-a', { events: [event({ platform: 'cmb', merchantName: null, idempotencyKey: 'c'.repeat(64) })] }) as { items: AcceptedIngestItem[] }).items[0]!;
    expect(() => service.confirmMany('user-a', { items: [first, second].map((item) => ({ id: item.captureId, version: 1 })) })).toThrow(/duplicate review/);
    expect(database.db.select().from(transactions).all()).toHaveLength(0);
    expect(service.get('user-a', first.captureId!).status).toBe('reviewing');
  });

  it('posts a reviewed batch atomically and replays it without extra transactions', async () => {
    const first = (await service.ingest('user-a', { events: [event()] }) as { items: AcceptedIngestItem[] }).items[0]!;
    const second = (await service.ingest('user-a', { events: [event({ amountMinor: 1234, idempotencyKey: 'c'.repeat(64) })] }) as { items: AcceptedIngestItem[] }).items[0]!;
    const input = { items: [first, second].map((item) => ({ id: item.captureId, version: 1 })) };
    expect(service.confirmMany('user-a', input).outcomes).toHaveLength(2);
    service.confirmMany('user-a', input);
    expect(database.db.select().from(transactions).all()).toHaveLength(2);
    expect(() => service.confirmMany('user-b', input)).toThrow();
  });


  function aiRuntimeStub(
    classifyBatch: (
      input: AiCategoryBatchInput,
    ) => Promise<AiCategoryResult[]>,
  ): AiCategorizationRuntime {
    return {
      provider: {
        name: "openai-compatible",
        model: "stub-model",
        enabled: true,
        sendsDataToThirdParty: false,
        classifyBatch,
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

  function seedStationeryCategory() {
    const now = new Date().toISOString();
    database.db
      .insert(categories)
      .values({
        id: "stationery-a",
        userId: "user-a",
        name: "文具",
        kind: "expense",
        icon: "Tags",
        color: "#777777",
        isSystem: true,
        sortOrder: 9,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  it("auto-links a deterministic duplicate for an authorized platform", async () => {
    service.updateSettings("user-a", { autoPostAlipay: true });
    const first = (await service.ingest("user-a", { events: [event()] })).items[0]! as AcceptedIngestItem;
    expect(first.reviewStatus).toBe("completed");

    const duplicate = (await service.ingest("user-a", {
      events: [event({ idempotencyKey: "5".repeat(64) })],
    })).items[0]! as AcceptedIngestItem;

    expect(duplicate.reviewStatus).toBe("completed");
    const capture = service.get("user-a", duplicate.captureId!);
    expect(capture).toMatchObject({
      status: "completed",
      duplicateStatus: "duplicate",
      resultCode: "AUTO_SKIPPED_DUPLICATE",
    });
    const posted = database.db.select().from(transactions).all();
    expect(posted).toHaveLength(1);
    expect(capture.duplicateTransactionId).toBe(posted[0]!.id);
  });

  it("keeps a deterministic duplicate in review when the platform is not authorized", async () => {
    const first = (await service.ingest("user-a", { events: [event()] })).items[0]! as AcceptedIngestItem;
    service.confirm("user-a", first.captureId!, { decision: "post" });

    const duplicate = (await service.ingest("user-a", {
      events: [event({ idempotencyKey: "5".repeat(64) })],
    })).items[0]! as AcceptedIngestItem;

    expect(duplicate.reviewStatus).toBe("reviewing");
    expect(
      service.get("user-a", duplicate.captureId!).duplicateStatus,
    ).toBe("duplicate");
  });

  it("still acknowledges and auto-posts a stored capture when AI categorization throws", async () => {
    const failing = createNotificationCaptureService(database.db, () => {
      throw new Error("categorization runtime unavailable");
    });
    failing.updateSettings("user-a", { autoPostAlipay: true });
    const result = await failing.ingest("user-a", {
      events: [event({ merchantName: "Unclassifiable Merchant 9" })],
    });
    expect(result.items[0]).toMatchObject({
      status: "accepted",
      reviewStatus: "completed",
      resultCode: "AUTO_POSTED",
    });
    expect(database.db.select().from(transactions).all()).toHaveLength(1);

    const held = await service.ingest("user-b", { events: [event()] });
    expect(held.items[0]).toMatchObject({ reviewStatus: "reviewing", resultCode: null });
  });

  it("still acknowledges a stored capture when the automation settings cannot be read", async () => {
    database.sqlite.exec("DROP TABLE notification_capture_settings");
    const result = await service.ingest("user-a", { events: [event()] });
    expect(result.items[0]).toMatchObject({
      status: "accepted",
      reviewStatus: "reviewing",
      resultCode: null,
    });
    expect(database.db.select().from(transactions).all()).toHaveLength(0);
  });

  it("applies high-confidence AI categories to captures local rules cannot classify", async () => {
    seedStationeryCategory();
    const aiService = createNotificationCaptureService(
      database.db,
      aiRuntimeStub(async (input) =>
        input.items.map((item) => ({
          itemRef: item.itemRef,
          categoryId: "stationery-a",
          confidence: 0.95,
          ambiguous: false,
          reason: "stub",
        })),
      ),
    );

    const accepted = (await aiService.ingest("user-a", {
      events: [event({ merchantName: "晨光文具店" })],
    })).items[0]! as AcceptedIngestItem;

    const capture = aiService.get("user-a", accepted.captureId!);
    expect(capture.categoryId).toBe("stationery-a");
    expect(capture.fieldOrigins.categoryId).toBe("ai_suggestion");
  });

  it("asks the AI for reasons in the capture request's language", async () => {
    seedStationeryCategory();
    const locales: string[] = [];
    const aiService = createNotificationCaptureService(
      database.db,
      aiRuntimeStub(async (input) => {
        locales.push(input.locale);
        return input.items.map((item) => ({
          itemRef: item.itemRef,
          categoryId: "stationery-a",
          confidence: 0.95,
          ambiguous: false,
          reason: "文具店",
        }));
      }),
    );

    await aiService.ingest("user-a", { events: [event({ merchantName: "晨光文具店" })] }, "zh");
    await aiService.ingest("user-b", { events: [event({ merchantName: "Corner Stationers" })] });

    expect(locales).toEqual(["zh", "en"]);
  });

  it("keeps the local fallback category when AI confidence is low", async () => {
    seedStationeryCategory();
    const aiService = createNotificationCaptureService(
      database.db,
      aiRuntimeStub(async (input) =>
        input.items.map((item) => ({
          itemRef: item.itemRef,
          categoryId: "stationery-a",
          confidence: 0.5,
          ambiguous: false,
          reason: "stub",
        })),
      ),
    );

    const accepted = (await aiService.ingest("user-a", {
      events: [event({ merchantName: "晨光文具店" })],
    })).items[0]! as AcceptedIngestItem;

    const capture = aiService.get("user-a", accepted.captureId!);
    expect(capture.categoryId).toBe("other-a");
    expect(capture.fieldOrigins.categoryId).toBe("categorization_rule");
  });

  it("auto-posts with the AI category when the platform is authorized", async () => {
    seedStationeryCategory();
    const aiService = createNotificationCaptureService(
      database.db,
      aiRuntimeStub(async (input) =>
        input.items.map((item) => ({
          itemRef: item.itemRef,
          categoryId: "stationery-a",
          confidence: 0.95,
          ambiguous: false,
          reason: "stub",
        })),
      ),
    );
    aiService.updateSettings("user-a", { autoPostAlipay: true });

    const accepted = (await aiService.ingest("user-a", {
      events: [event({ merchantName: "晨光文具店" })],
    })).items[0]! as AcceptedIngestItem;

    expect(accepted.reviewStatus).toBe("completed");
    const posted = database.db.select().from(transactions).get();
    expect(posted?.categoryId).toBe("stationery-a");
  });

  it("raises the auto-post cap for merchants with enough proven auto-posts", async () => {
    service.updateSettings("user-a", {
      autoPostAlipay: true,
      autoPostMaxAmountMinor: 1_000,
    });
    for (let index = 0; index < 5; index += 1) {
      const staged = (await service.ingest("user-a", {
        events: [
          event({
            idempotencyKey: `${index}`.padStart(64, "0"),
            amountMinor: 500,
            postedAt: `2026-07-2${index}T04:30:00.000Z`,
          }),
        ],
      })).items[0]! as AcceptedIngestItem;
      expect(staged.reviewStatus).toBe("completed");
    }

    // 可信商户：超过基础上限、不超过可信上限仍自动入账
    const trusted = (await service.ingest("user-a", {
      events: [
        event({
          idempotencyKey: "6".padStart(64, "0"),
          amountMinor: 5_000,
          postedAt: "2026-07-28T04:30:00.000Z",
        }),
      ],
    })).items[0]! as AcceptedIngestItem;
    expect(trusted.reviewStatus).toBe("completed");
    expect(service.get("user-a", trusted.captureId!).resultCode).toBe(
      "AUTO_POSTED",
    );

    // 超过可信上限仍保持人工审核
    const overTrustedCap = (await service.ingest("user-a", {
      events: [
        event({
          idempotencyKey: "7".padStart(64, "0"),
          amountMinor: 600_000,
          postedAt: "2026-07-29T04:30:00.000Z",
        }),
      ],
    })).items[0]! as AcceptedIngestItem;
    expect(overTrustedCap.reviewStatus).toBe("reviewing");
  });

  it("discounts amended or voided auto-posts from merchant trust", async () => {
    service.updateSettings("user-a", {
      autoPostAlipay: true,
      autoPostMaxAmountMinor: 1_000,
    });
    for (let index = 0; index < 5; index += 1) {
      await service.ingest("user-a", {
        events: [
          event({
            idempotencyKey: `${index}`.padStart(64, "0"),
            amountMinor: 500,
            postedAt: `2026-07-2${index}T04:30:00.000Z`,
          }),
        ],
      });
    }
    const posted = database.db.select().from(transactions).all();
    expect(posted).toHaveLength(5);
    database.db
      .update(transactions)
      .set({ revisionNumber: 2 })
      .where(eq(transactions.id, posted[0]!.id))
      .run();
    database.db
      .update(transactions)
      .set({ voidedAt: new Date().toISOString() })
      .where(eq(transactions.id, posted[1]!.id))
      .run();

    const next = (await service.ingest("user-a", {
      events: [
        event({
          idempotencyKey: "8".padStart(64, "0"),
          amountMinor: 5_000,
          postedAt: "2026-07-28T04:30:00.000Z",
        }),
      ],
    })).items[0]! as AcceptedIngestItem;

    expect(next.reviewStatus).toBe("reviewing");
  });
});
