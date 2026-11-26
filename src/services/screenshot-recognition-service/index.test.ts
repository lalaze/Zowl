import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import * as databaseSchema from "@/db/schema";
import {
  categories,
  merchantCategoryRules,
  postingConfirmations,
  recognitionJobs,
  storedFiles,
  transactionRevisions,
  transactions,
  users,
} from "@/db/schema";
import { createTransactionFingerprint } from "@/lib/fingerprint";
import type {
  AiCategorizationProvider,
  AiCategorizationRuntime,
  AiCategoryBatchInput,
  AiCategoryResult,
} from "@/services/ai-categorization-service";
import { createLocalFileStorage } from "@/services/file-storage-service";
import type {
  ReceiptRecognitionProvider,
  ReceiptRecognitionResult,
} from "@/services/receipt-recognition-service";
import { MockReceiptRecognitionProvider } from "@/services/receipt-recognition-service";
import {
  createScreenshotRecognitionService,
  receiptItemEditSchema,
  screenshotUploadLimits,
} from "@/services/screenshot-recognition-service";
import { createTransactionService } from "@/services/transaction-service";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const onePixelWebp = Buffer.from(
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AA/v89WAAAAA==",
  "base64",
).subarray(0, 42);

const recognizedReceipt: ReceiptRecognitionResult = {
  type: "expense",
  amount: 35.8,
  currency: "CNY",
  merchantName: "Mountain Cafe",
  description: "Latte",
  transactionTime: "2026-07-15T04:32:00.000Z",
  paymentMethod: "Yu’e Bao",
  platformTransactionId: "SHOT-001",
  status: "Transaction successful",
  source: "screenshot",
  suggestedCategory: "Food",
  confidence: 0.92,
  warnings: [],
};

class StaticReceiptProvider implements ReceiptRecognitionProvider {
  readonly name: string;
  readonly sendsImagesToThirdParty: boolean;

  constructor(
    private readonly result: ReceiptRecognitionResult,
    options: { name?: string; sendsImagesToThirdParty?: boolean } = {},
  ) {
    this.name = options.name ?? "test-static";
    this.sendsImagesToThirdParty = options.sendsImagesToThirdParty ?? false;
  }

  async recognize(): Promise<ReceiptRecognitionResult> {
    return structuredClone(this.result);
  }
}

class FailingReceiptProvider implements ReceiptRecognitionProvider {
  readonly name = "test-failing";
  readonly sendsImagesToThirdParty = false;

  async recognize(): Promise<ReceiptRecognitionResult> {
    throw new Error("provider unavailable");
  }
}

class SequenceReceiptProvider implements ReceiptRecognitionProvider {
  readonly name = "test-sequence";
  readonly sendsImagesToThirdParty = false;
  private nextResult = 0;

  constructor(private readonly results: ReceiptRecognitionResult[]) {}

  async recognize(): Promise<ReceiptRecognitionResult> {
    const result = this.results[this.nextResult];
    this.nextResult += 1;
    if (!result) throw new Error("missing sequenced recognition result");
    return structuredClone(result);
  }
}

class ScreenshotAiProvider implements AiCategorizationProvider {
  readonly name = "openai-compatible" as const;
  readonly model = "screenshot-test-model";
  readonly enabled = true;
  readonly sendsDataToThirdParty = false;
  readonly calls: AiCategoryBatchInput[] = [];

  async classifyBatch(input: AiCategoryBatchInput): Promise<AiCategoryResult[]> {
    this.calls.push(structuredClone(input));
    const food = input.categories.find((category) => category.name === "Food");
    return input.items.map((item) => {
      const ambiguous = /ELEVEN/iu.test(item.merchantName ?? "");
      return {
        itemRef: item.itemRef,
        categoryId: food?.id ?? null,
        confidence: ambiguous ? 0.68 : 0.97,
        ambiguous,
        reason: ambiguous ? "Ambiguous convenience store purchase" : "Tea shop",
      };
    });
  }
}

function screenshotAiRuntime(
  provider: ScreenshotAiProvider,
  fingerprint = "1".repeat(64),
): AiCategorizationRuntime {
  return {
    provider,
    autoThreshold: 0.85,
    batchSize: 20,
    configurationFingerprint: fingerprint,
    metadata: {
      mode: "local",
      providerLabel: "Test categorization service",
      configured: true,
      enabled: true,
      sendsDataToThirdParty: false,
      model: provider.model,
      disclosure: "Test",
      retentionPolicy: "Test",
    },
  };
}

function screenshot(name = "receipt.png", bytes: BlobPart = onePixelPng) {
  return new File([bytes], name, { type: "image/png" });
}

function pngVariant(marker: number) {
  const bytes = Buffer.from(onePixelPng);
  bytes[bytes.length - 1] = marker;
  return bytes;
}

function webpScreenshot(name = "receipt.webp") {
  return new File([onePixelWebp], name, { type: "image/webp" });
}

function thrownBy(action: () => unknown) {
  try {
    action();
    return null;
  } catch (error) {
    return error;
  }
}

function completedEdit(
  overrides: Partial<{
    type: "expense" | "income" | "transfer" | "refund";
    amountMinor: number;
    currency: string;
    merchantName: string | null;
    description: string | null;
    transactionTime: string;
    paymentMethod: string | null;
    platformTransactionId: string | null;
    transactionStatus: string | null;
    categoryId: string | null;
  }> = {},
) {
  return {
    type: "expense" as const,
    amountMinor: 1280,
    currency: "CNY",
    merchantName: "Manually entered merchant",
    description: "Manual completion",
    transactionTime: "2026-07-15T06:00:00.000Z",
    paymentMethod: null,
    platformTransactionId: null,
    transactionStatus: null,
    categoryId: "food-a",
    ...overrides,
  };
}

describe("screenshot recognition service", () => {
  let database: ReturnType<typeof createDatabase>;
  let storage: ReturnType<typeof createLocalFileStorage>;
  let storageRoot: string;
  let previousStorageRoot: string | undefined;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });

    const now = "2026-07-15T00:00:00.000Z";
    database.db
      .insert(users)
      .values([
        {
          id: "user-a",
          email: "screenshot-a@example.com",
          passwordHash: "test",
          displayName: "Screenshot A",
          timezone: "Asia/Shanghai",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "user-b",
          email: "screenshot-b@example.com",
          passwordHash: "test",
          displayName: "Screenshot B",
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
          id: "food-a",
          userId: "user-a",
          name: "Food",
          kind: "expense",
          isSystem: true,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "other-a",
          userId: "user-a",
          name: "Other",
          kind: "both",
          isSystem: true,
          sortOrder: 1,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "salary-a",
          userId: "user-a",
          name: "Salary",
          kind: "income",
          isSystem: true,
          sortOrder: 2,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "food-b",
          userId: "user-b",
          name: "Food",
          kind: "expense",
          isSystem: true,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    previousStorageRoot = process.env.FILE_STORAGE_ROOT;
    storageRoot = await mkdtemp(path.join(os.tmpdir(), "zemoney-receipts-"));
    process.env.FILE_STORAGE_ROOT = storageRoot;
    storage = createLocalFileStorage(database.db);
  });

  afterEach(async () => {
    database.sqlite.close();
    await rm(storageRoot, { recursive: true, force: true });
    if (previousStorageRoot === undefined) {
      delete process.env.FILE_STORAGE_ROOT;
    } else {
      process.env.FILE_STORAGE_ROOT = previousStorageRoot;
    }
  });

  it("rejects a non-two-decimal currency at the manual review boundary", () => {
    expect(
      receiptItemEditSchema.safeParse({
        type: "expense",
        amountMinor: 3_580,
        currency: "JPY",
        merchantName: null,
        description: null,
        transactionTime: "2026-07-15T04:30:00.000Z",
        paymentMethod: null,
        platformTransactionId: null,
        transactionStatus: null,
        categoryId: null,
      }).success,
    ).toBe(false);
  });

  function insertManualTransaction(
    overrides: Partial<{
      id: string;
      userId: string;
      amountMinor: number;
      merchantName: string;
      transactionTime: string;
    }> = {},
  ) {
    const data = {
      source: "manual" as const,
      type: "expense" as const,
      amountMinor: overrides.amountMinor ?? 3580,
      currency: "CNY",
      merchantName: overrides.merchantName ?? "Mountain Cafe",
      transactionTime:
        overrides.transactionTime ?? "2026-07-15T04:30:00.000Z",
    };
    const now = "2026-07-15T04:30:00.000Z";
    database.db
      .insert(transactions)
      .values({
        id: overrides.id ?? "manual-existing",
        userId: overrides.userId ?? "user-a",
        ...data,
        description: "Manual entry",
        categoryId: "food-a",
        createdAt: now,
        updatedAt: now,
        fingerprint: createTransactionFingerprint(data),
        duplicateStatus: "unique",
        needsReview: false,
      })
      .run();
  }

  it("stages a structured result, categorizes it, confirms it with the original image, and confirms idempotently", async () => {
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new StaticReceiptProvider(recognizedReceipt),
    );

    const uploaded = await service.upload("user-a", [screenshot()]);
    const item = uploaded.items[0]!;

    expect(uploaded.job).toMatchObject({
      status: "reviewing",
      totalCount: 1,
      succeededCount: 1,
      failedCount: 0,
    });
    expect(item).toMatchObject({
      status: "recognized",
      type: "expense",
      amountMinor: 3580,
      amount: "35.80",
      merchantName: "Mountain Cafe",
      categoryId: "food-a",
      confidence: 0.92,
      duplicateKind: "unique",
      decision: "import",
    });
    await expect(storage.read("user-a", item.fileId)).resolves.toMatchObject({
      bytes: onePixelPng,
      record: { id: item.fileId, kind: "screenshot" },
    });

    expect(service.confirm("user-a", uploaded.jobId)).toEqual({
      jobId: uploaded.jobId,
      createdCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });
    const transactions = createTransactionService(database.db).list("user-a");
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      amount: "35.80",
      source: "screenshot",
      categoryId: "food-a",
      originalFileId: item.fileId,
      platformTransactionId: "SHOT-001",
    });
    expect(database.db.select().from(transactionRevisions).all()).toHaveLength(
      1,
    );
    expect(database.db.select().from(postingConfirmations).all()).toHaveLength(
      1,
    );

    expect(service.confirm("user-a", uploaded.jobId)).toEqual({
      jobId: uploaded.jobId,
      createdCount: 1,
      skippedCount: 0,
      failedCount: 0,
    });
    expect(createTransactionService(database.db).list("user-a")).toHaveLength(1);
  });

  it("automatically posts one complete high-confidence screenshot", async () => {
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new StaticReceiptProvider({
        ...recognizedReceipt,
        platformTransactionId: "SHOT-AUTOMATIC",
        confidence: 0.96,
      }),
    );
    const uploaded = await service.upload("user-a", [
      screenshot("automatic.png"),
    ]);

    const result = service.confirmAutomatically("user-a", uploaded.jobId);

    expect(result).toMatchObject({
      status: "completed",
      jobId: uploaded.jobId,
      createdCount: 1,
      skippedCount: 0,
      failedCount: 0,
      transactionIds: [expect.any(String)],
    });
    expect(createTransactionService(database.db).list("user-a")).toEqual([
      expect.objectContaining({
        source: "screenshot",
        platformTransactionId: "SHOT-AUTOMATIC",
        amountMinor: 3_580,
      }),
    ]);
  });

  it("keeps a low-confidence screenshot in review instead of auto-posting", async () => {
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new StaticReceiptProvider({
        ...recognizedReceipt,
        platformTransactionId: "SHOT-LOW-CONFIDENCE",
        confidence: 0.89,
      }),
    );
    const uploaded = await service.upload("user-a", [
      screenshot("low-confidence.png"),
    ]);

    expect(
      service.confirmAutomatically("user-a", uploaded.jobId),
    ).toEqual({
      status: "needs_review",
      jobId: uploaded.jobId,
      reason: "low_confidence",
    });
    expect(service.getReview("user-a", uploaded.jobId).job.status).toBe(
      "reviewing",
    );
    expect(createTransactionService(database.db).list("user-a")).toEqual([]);
  });

  it("prefers a learned merchant rule over the Provider category hint", async () => {
    database.db
      .insert(merchantCategoryRules)
      .values({
        id: "learned-category-rule",
        userId: "user-a",
        categoryId: "other-a",
        normalizedMerchantName: "mountain cafe",
        matchType: "exact",
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
      })
      .run();
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new StaticReceiptProvider({
        ...recognizedReceipt,
        suggestedCategory: "Food",
      }),
    );

    const uploaded = await service.upload("user-a", [
      screenshot("learned-rule.png"),
    ]);

    expect(uploaded.items[0]).toMatchObject({
      merchantName: "Mountain Cafe",
      suggestedCategory: "Food",
      categoryId: "other-a",
    });
  });

  it("asks recognition and AI for text in the uploader's language and maps built-in names in either language", async () => {
    const seenLocales: string[] = [];
    const receiptProvider: ReceiptRecognitionProvider = {
      name: "test-locale",
      sendsImagesToThirdParty: false,
      async recognize(input) {
        seenLocales.push(input.locale);
        const first = seenLocales.length === 1;
        return {
          ...recognizedReceipt,
          merchantName: first ? "Recognized merchant without keywords" : "Lumora Joy Shop",
          // The model answered in Chinese although the built-in is named "Food".
          suggestedCategory: first ? "餐饮" : null,
          platformTransactionId: `SHOT-LOCALE-${seenLocales.length}`,
          transactionTime: `2026-07-15T0${seenLocales.length}:00:00.000Z`,
          warnings: ["交易时间不完整"],
        };
      },
    };
    const aiProvider = new ScreenshotAiProvider();
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      receiptProvider,
      screenshotAiRuntime(aiProvider),
    );

    const uploaded = await service.upload(
      "user-a",
      [screenshot("named.png", pngVariant(7)), screenshot("fallback.png", pngVariant(8))],
      { locale: "zh" },
    );
    await service.upload("user-b", [screenshot("en.png", pngVariant(9))]);

    expect(seenLocales).toEqual(["zh", "zh", "en"]);
    expect(uploaded.items[0]).toMatchObject({
      suggestedCategory: "餐饮",
      categoryId: "food-a",
      warnings: ["交易时间不完整"],
    });

    await service.classifyWithAi("user-a", uploaded.jobId, "zh");
    // Only the fallback goes to AI: "餐饮" already resolved to the Food built-in.
    expect(aiProvider.calls.map((call) => [call.locale, call.items.map((item) => item.merchantName)]))
      .toEqual([["zh", ["Lumora Joy Shop"]]]);
  });

  it("AI-enriches screenshot fallbacks without reclassifying a valid recognition suggestion", async () => {
    const aiProvider = new ScreenshotAiProvider();
    const receiptProvider = new SequenceReceiptProvider([
      {
        ...recognizedReceipt,
        merchantName: "Lumora Joy Shop",
        description: "Default item",
        suggestedCategory: null,
        platformTransactionId: "SHOT-AI-1",
        transactionTime: "2026-07-15T04:00:00.000Z",
      },
      {
        ...recognizedReceipt,
        merchantName: "Lakeside ELEVEN 7",
        description: "Default item",
        suggestedCategory: null,
        platformTransactionId: "SHOT-AI-2",
        transactionTime: "2026-07-15T05:00:00.000Z",
      },
      {
        ...recognizedReceipt,
        merchantName: "Recognized merchant without keywords",
        description: "Default item",
        suggestedCategory: "Food",
        platformTransactionId: "SHOT-AI-3",
        transactionTime: "2026-07-15T06:00:00.000Z",
      },
    ]);
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      receiptProvider,
      screenshotAiRuntime(aiProvider),
    );
    const uploaded = await service.upload("user-a", [
      screenshot("tea.png", pngVariant(1)),
      screenshot("seven.png", pngVariant(2)),
      screenshot("provider-suggested.png", pngVariant(3)),
    ]);
    expect(
      uploaded.items.map((item) => ({
        merchantName: item.merchantName,
        categoryId: item.categoryId,
        suggestedCategory: item.suggestedCategory,
        decision: item.decision,
      })),
    ).toEqual([
      {
        merchantName: "Lumora Joy Shop",
        categoryId: "other-a",
        suggestedCategory: null,
        decision: "import",
      },
      {
        merchantName: "Lakeside ELEVEN 7",
        categoryId: "other-a",
        suggestedCategory: null,
        decision: "import",
      },
      {
        merchantName: "Recognized merchant without keywords",
        categoryId: "food-a",
        suggestedCategory: "Food",
        decision: "import",
      },
    ]);

    await expect(
      service.classifyWithAi("user-a", uploaded.jobId),
    ).resolves.toMatchObject({
      enabled: true,
      failed: false,
      processed: 2,
      autoApplied: 1,
      needsReview: 1,
      remaining: 0,
    });
    expect(aiProvider.calls).toHaveLength(1);
    expect(aiProvider.calls[0]!.items.map((item) => item.merchantName)).toEqual([
      "Lumora Joy Shop",
      "Lakeside ELEVEN 7",
    ]);
    expect(aiProvider.calls[0]!.categories.map((category) => category.id)).toEqual([
      "food-a",
      "other-a",
      "salary-a",
    ]);

    const review = service.getReview("user-a", uploaded.jobId);
    const tea = review.items.find((item) => item.merchantName?.includes("Lumora"))!;
    const seven = review.items.find((item) => item.merchantName?.includes("ELEVEN"))!;
    const providerSuggested = review.items.find(
      (item) => item.platformTransactionId === "SHOT-AI-3",
    )!;
    expect(tea).toMatchObject({
      categoryId: "food-a",
      categorySuggestion: { status: "auto_applied", confidence: 0.97 },
    });
    expect(seven).toMatchObject({
      categoryId: "other-a",
      categorySuggestion: {
        categoryId: "food-a",
        status: "needs_review",
        ambiguous: true,
      },
    });
    expect(providerSuggested).toMatchObject({
      categoryId: "food-a",
      suggestedCategory: "Food",
    });
    expect(providerSuggested.categorySuggestion).toBeUndefined();
    expect(
      service.adoptAiCategorySuggestion("user-a", uploaded.jobId, seven.id),
    ).toMatchObject({
      categoryId: "food-a",
      categorySuggestion: { status: "adopted" },
    });
    expect(database.db.select().from(merchantCategoryRules).all()).toHaveLength(0);
    expect(service.confirm("user-a", uploaded.jobId)).toMatchObject({
      createdCount: 3,
      failedCount: 0,
    });
  });

  it("resolves changed user settings and replaces stale screenshot suggestions", async () => {
    const firstAiProvider = new ScreenshotAiProvider();
    const secondAiProvider = new ScreenshotAiProvider();
    let currentRuntime = screenshotAiRuntime(
      firstAiProvider,
      "1".repeat(64),
    );
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new StaticReceiptProvider({
        ...recognizedReceipt,
        merchantName: "Lumora Joy Shop",
        description: "Default item",
        suggestedCategory: null,
        platformTransactionId: "SHOT-AI-DYNAMIC",
      }),
      () => currentRuntime,
    );
    const uploaded = await service.upload("user-a", [
      screenshot("dynamic.png"),
    ]);

    await service.classifyWithAi("user-a", uploaded.jobId);
    currentRuntime = screenshotAiRuntime(
      secondAiProvider,
      "2".repeat(64),
    );
    expect(service.getReview("user-a", uploaded.jobId).items[0]).toMatchObject({
      categoryId: "other-a",
      categorySuggestion: undefined,
    });
    await service.classifyWithAi("user-a", uploaded.jobId);

    expect(firstAiProvider.calls).toHaveLength(1);
    expect(secondAiProvider.calls).toHaveLength(1);
    expect(service.getReview("user-a", uploaded.jobId).items[0]).toMatchObject({
      categorySuggestion: {
        configurationFingerprint: "2".repeat(64),
      },
    });
  });

  it("keeps screenshot review query count constant as item count grows", async () => {
    const selectQueries: string[] = [];
    const loggedDatabase = drizzle(database.sqlite, {
      schema: databaseSchema,
      logger: {
        logQuery(query) {
          if (/^\s*(select|with)\b/iu.test(query)) selectQueries.push(query);
        },
      },
    });
    const service = createScreenshotRecognitionService(
      loggedDatabase,
      storage,
      new StaticReceiptProvider({
        ...recognizedReceipt,
        platformTransactionId: null,
      }),
      screenshotAiRuntime(new ScreenshotAiProvider()),
    );
    const single = await service.upload("user-a", [
      screenshot("single.png", pngVariant(20)),
    ]);
    const many = await service.upload(
      "user-a",
      Array.from({ length: 10 }, (_, index) =>
        screenshot(`many-${index}.png`, pngVariant(30 + index)),
      ),
    );

    const countReviewQueries = (jobId: string) => {
      selectQueries.length = 0;
      const review = service.getReview("user-a", jobId);
      return { count: selectQueries.length, itemCount: review.items.length };
    };
    const oneItem = countReviewQueries(single.jobId);
    const tenItems = countReviewQueries(many.jobId);

    expect(oneItem).toEqual({ count: 2, itemCount: 1 });
    expect(tenItems).toEqual({ count: oneItem.count, itemCount: 10 });
  });

  it("posts Other instead of a stale auto-applied screenshot suggestion", async () => {
    const aiProvider = new ScreenshotAiProvider();
    let currentRuntime = screenshotAiRuntime(aiProvider, "1".repeat(64));
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new StaticReceiptProvider({
        ...recognizedReceipt,
        merchantName: "Lumora Joy Shop",
        description: "Default item",
        suggestedCategory: null,
        platformTransactionId: "SHOT-AI-STALE",
      }),
      () => currentRuntime,
    );
    const uploaded = await service.upload("user-a", [
      screenshot("stale.png"),
    ]);
    await service.classifyWithAi("user-a", uploaded.jobId);
    currentRuntime = screenshotAiRuntime(aiProvider, "2".repeat(64));

    expect(service.confirm("user-a", uploaded.jobId)).toMatchObject({
      createdCount: 1,
    });
    expect(createTransactionService(database.db).list("user-a")[0]).toMatchObject({
      categoryId: "other-a",
    });
  });

  it("keeps a failed provider result reviewable, readable, and manually confirmable", async () => {
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new FailingReceiptProvider(),
    );

    const uploaded = await service.upload("user-a", [screenshot("failed.png")]);
    const failedItem = uploaded.items[0]!;

    expect(uploaded.job).toMatchObject({
      status: "reviewing",
      succeededCount: 0,
      failedCount: 1,
    });
    expect(failedItem).toMatchObject({
      status: "recognition_failed",
      decision: "pending",
      errorMessage: "Recognition service temporarily unavailable",
    });
    expect(failedItem.validationErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "RECOGNITION_FAILED" }),
        expect.objectContaining({ field: "amountMinor", code: "REQUIRED" }),
      ]),
    );
    await expect(storage.read("user-a", failedItem.fileId)).resolves.toMatchObject({
      bytes: onePixelPng,
    });

    const completed = service.updateItem(
      "user-a",
      uploaded.jobId,
      failedItem.id,
      completedEdit(),
    );
    expect(completed).toMatchObject({
      status: "recognized",
      amountMinor: 1280,
      categoryId: "food-a",
      validationErrors: [],
      decision: "import",
    });
    expect(service.confirm("user-a", uploaded.jobId)).toMatchObject({
      createdCount: 1,
      skippedCount: 0,
      failedCount: 1,
    });
    expect(createTransactionService(database.db).list("user-a")[0]).toMatchObject({
      originalFileId: failedItem.fileId,
      amount: "12.80",
    });
  });

  it("lets a user skip an incomplete Mock result and complete the job", async () => {
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new MockReceiptRecognitionProvider(),
    );

    const uploaded = await service.upload("user-a", [screenshot("mock.png")]);
    const item = uploaded.items[0]!;
    expect(uploaded.job).toMatchObject({
      status: "reviewing",
      succeededCount: 1,
      failedCount: 0,
    });
    expect(item).toMatchObject({
      status: "recognized",
      amountMinor: null,
      decision: "pending",
    });
    await expect(storage.read("user-a", item.fileId)).resolves.toMatchObject({
      bytes: onePixelPng,
    });

    expect(
      service.setDecision("user-a", uploaded.jobId, item.id, "skip"),
    ).toMatchObject({ decision: "skip" });
    expect(service.confirm("user-a", uploaded.jobId)).toMatchObject({
      createdCount: 0,
      skippedCount: 1,
    });
    expect(createTransactionService(database.db).list("user-a")).toHaveLength(0);
  });

  it.each([
    {
      id: "mock",
      sendsImagesToThirdParty: false,
      label: "Mock Local demo",
      disclosure: "Screenshots are not sent externally. Complete missing fields using the original image.",
      retentionPolicy: "Mock No third-party copies are created.",
    },
    {
      id: "http-json",
      sendsImagesToThirdParty: true,
      label: "Configured third-party recognition service",
      disclosure: "Original screenshots are sent to the configured recognition service solely to extract transaction fields.",
      retentionPolicy: "Third-party retention depends on the agreement between the deployer and provider.",
    },
    {
      id: "unavailable",
      sendsImagesToThirdParty: false,
      label: "Recognition service is currently unavailable",
      disclosure: "No images are sent externally. Use retained originals to fill in fields after upload.",
      retentionPolicy: "No third-party service is called and no third-party copy is created.",
    },
  ])("returns complete provider privacy metadata for $id", (scenario) => {
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new StaticReceiptProvider(recognizedReceipt, {
        name: scenario.id,
        sendsImagesToThirdParty: scenario.sendsImagesToThirdParty,
      }),
    );

    expect(service.providerInfo()).toEqual(scenario);
  });

  it("requires third-party consent before writing any file or job", async () => {
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new StaticReceiptProvider(recognizedReceipt, {
        name: "test-third-party",
        sendsImagesToThirdParty: true,
      }),
    );

    expect(service.providerInfo()).toMatchObject({
      id: "test-third-party",
      sendsImagesToThirdParty: true,
    });

    await expect(
      service.upload("user-a", [screenshot("private.png")]),
    ).rejects.toMatchObject({
      code: "THIRD_PARTY_CONSENT_REQUIRED",
      status: 422,
    });
    expect(database.db.select().from(storedFiles).all()).toHaveLength(0);
    expect(database.db.select().from(recognitionJobs).all()).toHaveLength(0);

    await expect(
      service.upload("user-a", [screenshot("consented.png")], {
        consentToThirdParty: true,
      }),
    ).resolves.toMatchObject({
      job: { status: "reviewing", providerId: "test-third-party" },
    });
  });

  it.each([
    {
      scenario: "zero images",
      files: () => [] as File[],
      code: "MISSING_IMAGES",
      status: 400,
    },
    {
      scenario: "eleven images",
      files: () =>
        Array.from({ length: 11 }, (_, index) =>
          screenshot(`receipt-${index}.png`),
        ),
      code: "TOO_MANY_IMAGES",
      status: 422,
    },
    {
      scenario: "more than 40 MiB in one job",
      files: () => [
        screenshot(
          "oversized-job.png",
          new Uint8Array(screenshotUploadLimits.totalBytes + 1),
        ),
      ],
      code: "IMAGE_JOB_TOO_LARGE",
      status: 413,
    },
  ])(
    "rejects $scenario before persisting anything",
    async ({ files, code, status }) => {
      const service = createScreenshotRecognitionService(
        database.db,
        storage,
        new StaticReceiptProvider(recognizedReceipt),
      );

      await expect(service.upload("user-a", files())).rejects.toMatchObject({
        code,
        status,
      });
      expect(database.db.select().from(storedFiles).all()).toHaveLength(0);
      expect(database.db.select().from(recognitionJobs).all()).toHaveLength(0);
    },
  );

  it("returns not found when another user asks for a recognition job or item", async () => {
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new StaticReceiptProvider(recognizedReceipt),
    );
    const uploaded = await service.upload("user-a", [screenshot("owned.png")]);
    const item = uploaded.items[0]!;

    expect(
      thrownBy(() => service.getReview("user-b", uploaded.jobId)),
    ).toMatchObject({ code: "RECOGNITION_JOB_NOT_FOUND", status: 404 });
    expect(
      thrownBy(() => service.getItem("user-b", uploaded.jobId, item.id)),
    ).toMatchObject({ code: "RECOGNITION_ITEM_NOT_FOUND", status: 404 });
    expect(
      thrownBy(() => service.confirm("user-b", uploaded.jobId)),
    ).toMatchObject({ code: "RECOGNITION_JOB_NOT_FOUND", status: 404 });
    expect(service.listJobs("user-b")).toEqual([]);
  });

  it("requires an explicit skip or import-anyway decision for possible duplicates", async () => {
    insertManualTransaction();
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new StaticReceiptProvider(recognizedReceipt),
    );

    const skippedUpload = await service.upload("user-a", [
      screenshot("possible-skip.png"),
    ]);
    const skippedItem = skippedUpload.items[0]!;
    expect(skippedItem).toMatchObject({
      duplicateKind: "possible_duplicate",
      duplicateTransactionId: "manual-existing",
      decision: "pending",
    });
    expect(
      service.setDecision(
        "user-a",
        skippedUpload.jobId,
        skippedItem.id,
        "import",
      ),
    ).toMatchObject({
      duplicateKind: "possible_duplicate",
      decision: "pending",
    });
    expect(() => service.confirm("user-a", skippedUpload.jobId)).toThrowError(
      "Some screenshots still need fields completed or duplicate decisions",
    );
    service.setDecision(
      "user-a",
      skippedUpload.jobId,
      skippedItem.id,
      "skip",
    );
    expect(service.confirm("user-a", skippedUpload.jobId)).toMatchObject({
      createdCount: 0,
      skippedCount: 1,
    });

    const overrideUpload = await service.upload("user-a", [
      screenshot("possible-override.png"),
    ]);
    const overrideItem = overrideUpload.items[0]!;
    expect(overrideItem).toMatchObject({
      duplicateKind: "possible_duplicate",
      decision: "pending",
    });
    expect(
      service.setDecision(
        "user-a",
        overrideUpload.jobId,
        overrideItem.id,
        "import_anyway",
      ),
    ).toMatchObject({ decision: "import_anyway" });
    expect(service.confirm("user-a", overrideUpload.jobId)).toMatchObject({
      createdCount: 1,
      skippedCount: 0,
    });
    expect(
      createTransactionService(database.db)
        .list("user-a")
        .find((transaction) => transaction.source === "screenshot"),
    ).toMatchObject({
      duplicateStatus: "possible_duplicate",
      needsReview: false,
      originalFileId: overrideItem.fileId,
    });
  });

  it("returns a job to reviewing when a new possible duplicate appears before confirmation", async () => {
    const toctouResult: ReceiptRecognitionResult = {
      ...recognizedReceipt,
      platformTransactionId: "SHOT-TOCTOU",
    };
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new StaticReceiptProvider(toctouResult),
    );
    const uploaded = await service.upload("user-a", [screenshot("toctou.png")]);
    expect(uploaded.items[0]).toMatchObject({
      duplicateKind: "unique",
      decision: "import",
    });

    insertManualTransaction({ id: "manual-concurrent" });

    expect(() => service.confirm("user-a", uploaded.jobId)).toThrowError(
      "New possible duplicates found before confirmation. Choose how to handle them again",
    );
    const review = service.getReview("user-a", uploaded.jobId);
    expect(review.job.status).toBe("reviewing");
    expect(review.items[0]).toMatchObject({
      duplicateKind: "possible_duplicate",
      duplicateTransactionId: "manual-concurrent",
      decision: "pending",
      resultTransactionId: null,
    });
    expect(
      createTransactionService(database.db)
        .list("user-a")
        .filter((transaction) => transaction.source === "screenshot"),
    ).toHaveLength(0);
  });

  it("skips later byte-identical screenshots in the same job by default", async () => {
    const batchResult: ReceiptRecognitionResult = {
      ...recognizedReceipt,
      platformTransactionId: "SHOT-BATCH",
    };
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new StaticReceiptProvider(batchResult),
    );

    const uploaded = await service.upload("user-a", [
      screenshot("batch-first.png"),
      screenshot("batch-second.png"),
    ]);
    expect(uploaded.items.map((item) => item.decision)).toEqual([
      "import",
      "skip",
    ]);
    expect(uploaded.items.map((item) => item.duplicateKind)).toEqual([
      "unique",
      "duplicate",
    ]);
    expect(uploaded.items[1]?.warnings).toContain(
      "Identical to an earlier original screenshot in this batch",
    );

    expect(service.confirm("user-a", uploaded.jobId)).toMatchObject({
      createdCount: 1,
      skippedCount: 1,
    });
    expect(createTransactionService(database.db).list("user-a")).toHaveLength(1);
  });

  it("rejects another user's category and a category incompatible with the transaction type", async () => {
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new StaticReceiptProvider(recognizedReceipt),
    );
    const uploaded = await service.upload("user-a", [
      screenshot("category-security.png"),
    ]);
    const item = uploaded.items[0]!;

    expect(
      thrownBy(() =>
        service.updateItem(
          "user-a",
          uploaded.jobId,
          item.id,
          completedEdit({ categoryId: "food-b" }),
        ),
      ),
    ).toMatchObject({ code: "CATEGORY_NOT_FOUND", status: 422 });
    expect(
      thrownBy(() =>
        service.updateItem(
          "user-a",
          uploaded.jobId,
          item.id,
          completedEdit({ categoryId: "salary-a" }),
        ),
      ),
    ).toMatchObject({ code: "CATEGORY_NOT_FOUND", status: 422 });
    expect(service.getItem("user-a", uploaded.jobId, item.id)).toMatchObject({
      categoryId: "food-a",
      amountMinor: 3580,
      decision: "import",
    });
  });

  it("rolls back the whole confirmation transaction after an unexpected database write failure", async () => {
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new StaticReceiptProvider({
        ...recognizedReceipt,
        platformTransactionId: "SHOT-ROLLBACK",
      }),
    );
    const uploaded = await service.upload("user-a", [
      screenshot("rollback.png"),
    ]);
    const item = uploaded.items[0]!;
    database.sqlite.exec(`
      CREATE TRIGGER force_screenshot_transaction_failure
      BEFORE INSERT ON transactions
      BEGIN
        SELECT RAISE(ABORT, 'forced screenshot transaction failure');
      END;
    `);

    expect(() => service.confirm("user-a", uploaded.jobId)).toThrowError(
      "forced screenshot transaction failure",
    );
    expect(service.getReview("user-a", uploaded.jobId)).toMatchObject({
      job: {
        status: "reviewing",
        importedCount: 0,
        skippedCount: 0,
        completedAt: null,
      },
      items: [
        expect.objectContaining({
          id: item.id,
          decision: "import",
          resultCode: null,
          resultTransactionId: null,
        }),
      ],
    });
    expect(createTransactionService(database.db).list("user-a")).toHaveLength(0);

    database.sqlite.exec("DROP TRIGGER force_screenshot_transaction_failure");
    expect(service.confirm("user-a", uploaded.jobId)).toMatchObject({
      createdCount: 1,
      skippedCount: 0,
    });
  });

  it("rechecks batch duplicates when a skipped item is restored after another item is edited to match it", async () => {
    const firstResult: ReceiptRecognitionResult = {
      ...recognizedReceipt,
      platformTransactionId: null,
    };
    const secondResult: ReceiptRecognitionResult = {
      ...recognizedReceipt,
      amount: 20,
      merchantName: "Green Mountain Books",
      description: "Books",
      transactionTime: "2026-07-15T08:00:00.000Z",
      platformTransactionId: null,
    };
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new SequenceReceiptProvider([firstResult, secondResult]),
    );
    const uploaded = await service.upload("user-a", [
      screenshot("mutable-first.png"),
      webpScreenshot("mutable-second.webp"),
    ]);
    const [firstItem, secondItem] = uploaded.items;
    expect(firstItem).toMatchObject({
      duplicateKind: "unique",
      decision: "import",
    });
    expect(secondItem).toMatchObject({
      duplicateKind: "unique",
      decision: "import",
    });

    service.setDecision(
      "user-a",
      uploaded.jobId,
      secondItem!.id,
      "skip",
    );
    service.updateItem(
      "user-a",
      uploaded.jobId,
      firstItem!.id,
      completedEdit({
        amountMinor: 2000,
        merchantName: "Green Mountain Books",
        description: "Books",
        transactionTime: "2026-07-15T08:00:00.000Z",
        platformTransactionId: null,
        transactionStatus: "Transaction successful",
        paymentMethod: "Yu’e Bao",
      }),
    );
    service.setDecision(
      "user-a",
      uploaded.jobId,
      secondItem!.id,
      "import",
    );

    expect(service.confirm("user-a", uploaded.jobId)).toMatchObject({
      createdCount: 1,
      skippedCount: 1,
    });
    const finalReview = service.getReview("user-a", uploaded.jobId);
    expect(
      createTransactionService(database.db)
        .list("user-a")
        .filter((transaction) => transaction.source === "screenshot"),
    ).toHaveLength(1);
    expect(finalReview.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          duplicateKind: "duplicate",
          decision: "skip",
          resultCode: "SKIPPED_DUPLICATE",
        }),
      ]),
    );
  });

  it("stages the same platform transaction ID from another source for explicit duplicate review even when the stored merchant is missing", async () => {
    const platformTransactionId = "CROSS-SOURCE-PLATFORM-001";
    const existing = {
      source: "alipay" as const,
      type: "expense" as const,
      amountMinor: 8800,
      currency: "CNY",
      merchantName: null,
      transactionTime: "2026-07-15T09:00:00.000Z",
    };
    database.db
      .insert(transactions)
      .values({
        id: "alipay-cross-source",
        userId: "user-a",
        ...existing,
        description: "Existing Alipay record",
        categoryId: "food-a",
        platformTransactionId,
        createdAt: existing.transactionTime,
        updatedAt: existing.transactionTime,
        fingerprint: createTransactionFingerprint(existing),
        duplicateStatus: "unique",
        needsReview: false,
      })
      .run();
    const screenshotResult: ReceiptRecognitionResult = {
      ...recognizedReceipt,
      amount: 88,
      merchantName: "Different recognized merchant",
      description: "Screenshot record",
      transactionTime: existing.transactionTime,
      platformTransactionId,
    };
    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new StaticReceiptProvider(screenshotResult),
    );

    const uploaded = await service.upload("user-a", [
      screenshot("cross-source-platform.png"),
    ]);

    expect(uploaded.job.status).toBe("reviewing");
    expect(uploaded.items[0]).toMatchObject({
      duplicateKind: "possible_duplicate",
      duplicateTransactionId: "alipay-cross-source",
      decision: "pending",
    });
  });
  it('recovers an already posted screenshot by submission identity without posting again', async () => {
    const service = createScreenshotRecognitionService(database.db, storage, new StaticReceiptProvider(recognizedReceipt));
    const options = { submissionId: 'stable-submission-1234' };
    const first = await service.upload('user-a', [screenshot()], options);
    const posted = service.confirmAutomatically('user-a', first.jobId);
    expect(posted.status).toBe('completed');
    const recovered = await service.upload('user-a', [screenshot()], options);
    expect(recovered.jobId).toBe(first.jobId);
    expect(service.confirmAutomatically('user-a', recovered.jobId)).toEqual(posted);
    expect(database.db.select().from(recognitionJobs).all()).toHaveLength(1);
    expect(database.db.select().from(transactions).all()).toHaveLength(1);
    expect(database.db.select().from(storedFiles).all()).toHaveLength(1);
    const otherUser = await service.upload('user-b', [screenshot()], options);
    expect(otherUser.jobId).not.toBe(first.jobId);
    await expect(service.upload('user-a', [screenshot(), screenshot()], options)).rejects.toMatchObject({ code: 'SUBMISSION_CONFLICT' });
  });

  it('coalesces concurrent screenshot submissions and cleans up losing uploaded originals', async () => {
    const service = createScreenshotRecognitionService(database.db, storage, new StaticReceiptProvider(recognizedReceipt));
    const uploads = await Promise.all([1, 2].map(() => service.upload('user-a', [screenshot()], { submissionId: 'concurrent-submission-1234' })));
    expect(uploads[0]!.jobId).toBe(uploads[1]!.jobId);
    expect(database.db.select().from(recognitionJobs).all()).toHaveLength(1);
    expect(database.db.select().from(storedFiles).all().filter((file) => !file.deletedAt)).toHaveLength(1);
  });

  it("records every IMPORTED and SKIPPED_* result code and outcome column on confirm", async () => {
    const existing = {
      source: "screenshot" as const,
      type: "expense" as const,
      amountMinor: 4200,
      currency: "CNY",
      merchantName: "Harbor Bakery",
      transactionTime: "2026-07-16T02:00:00.000Z",
    };
    database.db
      .insert(transactions)
      .values({
        id: "existing-shot-pin-tx",
        userId: "user-a",
        ...existing,
        description: "Existing bun",
        categoryId: "food-a",
        platformTransactionId: "SHOT-PIN-DUP",
        createdAt: existing.transactionTime,
        updatedAt: existing.transactionTime,
        fingerprint: createTransactionFingerprint(existing),
        duplicateStatus: "unique",
        needsReview: false,
      })
      .run();

    const service = createScreenshotRecognitionService(
      database.db,
      storage,
      new SequenceReceiptProvider([
        {
          ...recognizedReceipt,
          amount: 18,
          merchantName: "Cedar Tea House",
          description: "Green tea",
          transactionTime: "2026-07-16T01:00:00.000Z",
          platformTransactionId: "SHOT-PIN-OK",
        },
        {
          ...recognizedReceipt,
          amount: 42,
          merchantName: "Harbor Bakery",
          description: "Existing bun",
          transactionTime: "2026-07-16T02:00:00.000Z",
          platformTransactionId: "SHOT-PIN-DUP",
        },
        {
          ...recognizedReceipt,
          amount: 42,
          merchantName: "Harbor Bakery",
          description: "Another bun",
          transactionTime: "2026-07-16T02:02:00.000Z",
          platformTransactionId: "SHOT-PIN-POSS-SKIP",
        },
        {
          ...recognizedReceipt,
          amount: 42,
          merchantName: "Harbor Bakery",
          description: "Override bun",
          transactionTime: "2026-07-16T02:03:00.000Z",
          platformTransactionId: "SHOT-PIN-POSS-OVERRIDE",
        },
        {
          ...recognizedReceipt,
          amount: 25,
          merchantName: "Maple Bookshop",
          description: "Notebook",
          transactionTime: "2026-07-16T03:00:00.000Z",
          platformTransactionId: "SHOT-PIN-USER-SKIP",
        },
        {
          ...recognizedReceipt,
          type: null,
          amount: null,
          merchantName: "Broken Shot Shop",
          description: "Missing fields",
          transactionTime: null,
          platformTransactionId: "SHOT-PIN-INVALID",
        },
      ]),
    );

    const uploaded = await service.upload("user-a", [
      screenshot("pin-1.png", pngVariant(41)),
      screenshot("pin-2.png", pngVariant(42)),
      screenshot("pin-3.png", pngVariant(43)),
      screenshot("pin-4.png", pngVariant(44)),
      screenshot("pin-5.png", pngVariant(45)),
      screenshot("pin-6.png", pngVariant(46)),
    ]);

    service.setDecision("user-a", uploaded.jobId, uploaded.items[2]!.id, "skip");
    service.setDecision(
      "user-a",
      uploaded.jobId,
      uploaded.items[3]!.id,
      "import_anyway",
    );
    service.setDecision("user-a", uploaded.jobId, uploaded.items[4]!.id, "skip");
    service.setDecision("user-a", uploaded.jobId, uploaded.items[5]!.id, "skip");

    expect(service.confirm("user-a", uploaded.jobId)).toMatchObject({
      createdCount: 2,
      skippedCount: 4,
    });

    const completed = service.getReview("user-a", uploaded.jobId);
    expect(completed.items[0]).toMatchObject({
      resultCode: "IMPORTED",
      duplicateKind: "unique",
      duplicateTransactionId: null,
      decision: "import",
    });
    expect(completed.items[0]?.resultTransactionId).toBeTruthy();

    expect(completed.items[1]).toMatchObject({
      resultCode: "SKIPPED_DUPLICATE",
      resultTransactionId: null,
      duplicateKind: "duplicate",
      duplicateTransactionId: "existing-shot-pin-tx",
      decision: "skip",
    });

    expect(completed.items[2]).toMatchObject({
      resultCode: "SKIPPED_POSSIBLE_DUPLICATE",
      resultTransactionId: null,
      duplicateKind: "possible_duplicate",
      duplicateTransactionId: "existing-shot-pin-tx",
      decision: "skip",
    });

    expect(completed.items[3]).toMatchObject({
      resultCode: "IMPORTED",
      duplicateKind: "possible_duplicate",
      duplicateTransactionId: "existing-shot-pin-tx",
      decision: "import_anyway",
    });
    expect(completed.items[3]?.resultTransactionId).toBeTruthy();

    expect(completed.items[4]).toMatchObject({
      resultCode: "SKIPPED_BY_USER",
      resultTransactionId: null,
      duplicateKind: "unique",
      duplicateTransactionId: null,
      decision: "skip",
    });

    expect(completed.items[5]).toMatchObject({
      resultCode: "SKIPPED_INVALID",
      resultTransactionId: null,
      decision: "skip",
    });
  });

});
