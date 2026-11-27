import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import {
  categories,
  importItems,
  merchantCategoryRules,
  notificationCaptures,
  postingConfirmations,
  storedFiles,
  transactionRevisions,
  transactionSupplementalEvidence,
  transactions,
  users,
} from "@/db/schema";
import type {
  AiCategorizationProvider,
  AiCategorizationRuntime,
  AiCategoryBatchInput,
  AiCategoryResult,
} from "@/services/ai-categorization-service";
import { createTransactionFingerprint } from "@/lib/fingerprint";
import { createLocalFileStorage } from "@/services/file-storage-service";
import { createImportService } from "@/services/import-service";
import { createNotificationCaptureService } from "@/services/notification-capture-service";

type AcceptedIngestItem = Extract<
  Awaited<
    ReturnType<ReturnType<typeof createNotificationCaptureService>["ingest"]>
  >["items"][number],
  { captureId: string }
>;

class ImportAiProvider implements AiCategorizationProvider {
  readonly name = "openai-compatible" as const;
  readonly model = "import-test-model";
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
        confidence: ambiguous ? 0.7 : 0.98,
        ambiguous,
        reason: ambiguous ? "Ambiguous convenience store purchase" : "Tea shop",
      };
    });
  }
}

class FailingImportAiProvider implements AiCategorizationProvider {
  readonly name = "openai-compatible" as const;
  readonly model = "failing-import-test-model";
  readonly enabled = true;
  readonly sendsDataToThirdParty = false;

  async classifyBatch(): Promise<AiCategoryResult[]> {
    throw new Error("provider unavailable");
  }
}

function aiRuntime(
  provider: AiCategorizationProvider,
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

describe("import service", () => {
  let database: ReturnType<typeof createDatabase>;
  let storageRoot: string;
  let service: ReturnType<typeof createImportService>;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    const now = "2026-07-15T00:00:00.000Z";
    database.db
      .insert(users)
      .values({
        id: "import-user",
        email: "import@example.com",
        passwordHash: "test",
        displayName: "Import",
        timezone: "Asia/Shanghai",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(categories)
      .values([
        { id: "food", userId: "import-user", name: "Food", kind: "expense", isSystem: true, sortOrder: 0, createdAt: now, updatedAt: now },
        { id: "salary", userId: "import-user", name: "Salary", kind: "income", isSystem: true, sortOrder: 1, createdAt: now, updatedAt: now },
        { id: "other", userId: "import-user", name: "Other", kind: "both", isSystem: true, sortOrder: 2, createdAt: now, updatedAt: now },
      ])
      .run();
    storageRoot = await mkdtemp(path.join(tmpdir(), "zowl-import-"));
    process.env.FILE_STORAGE_ROOT = storageRoot;
    service = createImportService(
      database.db,
      createLocalFileStorage(database.db),
    );
  });

  afterEach(async () => {
    database.sqlite.close();
    await rm(storageRoot, { recursive: true, force: true });
    delete process.env.FILE_STORAGE_ROOT;
  });

  it("stages, confirms and then detects a repeated Alipay file", async () => {
    const bytes = await readFile(
      path.resolve(
        process.cwd(),
        "src/services/import-service/fixtures/alipay.csv",
      ),
    );
    const first = await service.upload(
      "import-user",
      new File([bytes], "alipay.csv", { type: "text/csv" }),
    );
    const review = service.getReview("import-user", first.batchId);

    expect(review.batch.source).toBe("alipay");
    expect(review.batch.totalCount).toBe(3);
    expect(review.batch.validCount).toBe(3);
    expect(review.decisionCounts.import).toBe(2);
    expect(review.decisionCounts.skip).toBe(1);

    const result = service.confirm("import-user", first.batchId);
    expect(result.batch.status).toBe("completed");
    expect(result.batch.importedCount).toBe(2);
    expect(
      database.db
        .select()
        .from(transactions)
        .where(eq(transactions.userId, "import-user"))
        .all(),
    ).toHaveLength(2);
    expect(database.db.select().from(transactionRevisions).all()).toHaveLength(
      2,
    );
    expect(database.db.select().from(postingConfirmations).all()).toHaveLength(
      1,
    );
    const importedIds = database.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.userId, "import-user"))
      .all()
      .map((item) => item.id)
      .sort();
    const repeatedConfirm = service.confirm("import-user", first.batchId);
    expect(repeatedConfirm.batch.importedCount).toBe(2);
    expect(
      database.db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.userId, "import-user"))
        .all()
        .map((item) => item.id)
        .sort(),
    ).toEqual(importedIds);

    const second = await service.upload(
      "import-user",
      new File([bytes], "alipay-again.csv", { type: "text/csv" }),
    );
    const repeated = service.getReview("import-user", second.batchId);
    expect(repeated.batch.duplicateCount).toBe(2);
    expect(repeated.decisionCounts.skip).toBe(3);

    const secondResult = service.confirm("import-user", second.batchId);
    expect(secondResult.batch.importedCount).toBe(0);
    expect(
      database.db
        .select()
        .from(storedFiles)
        .where(eq(storedFiles.userId, "import-user"))
        .all(),
    ).toHaveLength(2);
  });

  it("stages a unique Alipay row as enrichment for a pending notification capture", async () => {
    const captureService = createNotificationCaptureService(database.db);
    const accepted = (await captureService.ingest("import-user", {
      events: [
        {
          idempotencyKey: "a".repeat(64),
          platform: "alipay",
          sourcePackage: "com.eg.android.AlipayGphone",
          postedAt: "2026-07-15T04:30:00.000Z",
          parserId: "alipay-payment-success",
          parserVersion: 1,
          evidenceDigest: "b".repeat(64),
          confidenceBasisPoints: 9_000,
          facts: { amountMinor: 3_580, merchantName: null },
        },
      ],
    })).items[0]! as AcceptedIngestItem;
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status,Payment method",
      "ALI-ENRICH-PENDING,2026-07-15 12:30:00,Mountain Cafe,Latte coffee,35.80,Expense,Transaction successful,Alipay balance",
    ].join("\n");

    const staged = await service.upload(
      "import-user",
      new File([csv], "enrich-pending.csv", { type: "text/csv" }),
    );
    const item = service.getReview("import-user", staged.batchId).items[0]!;

    expect(item).toMatchObject({
      decision: "import",
      duplicateStatus: "unique",
      enrichmentData: {
        status: "ready",
        targetKind: "notification_capture",
        targetId: accepted.captureId,
        proposed: {
          merchantName: "Mountain Cafe",
          description: "Latte coffee",
          paymentMethod: "Alipay balance",
        },
        conflicts: [],
      },
    });

    const result = service.confirm("import-user", staged.batchId);
    expect(result.batch).toMatchObject({
      importedCount: 1,
      createdCount: 0,
      enrichedCount: 1,
    });
    expect(result.items[0]).toMatchObject({
      resultCode: "ENRICHED_CAPTURE_POSTED",
      resultTransactionId: expect.any(String),
    });
    expect(database.db.select().from(transactions).all()).toEqual([
      expect.objectContaining({
        source: "alipay",
        amountMinor: 3_580,
        currency: "CNY",
        transactionTime: "2026-07-15T04:30:00.000Z",
        merchantName: "Mountain Cafe",
        description: "Latte coffee",
        paymentMethod: "Alipay balance",
      }),
    ]);
    expect(
      database.db
        .select()
        .from(notificationCaptures)
        .where(eq(notificationCaptures.id, accepted.captureId!))
        .get(),
    ).toMatchObject({
      status: "completed",
      resultTransactionId: expect.any(String),
    });
  });

  it("appends a revision and supplemental evidence when enriching a posted notification transaction", async () => {
    const captureService = createNotificationCaptureService(database.db);
    const accepted = (await captureService.ingest("import-user", {
      events: [
        {
          idempotencyKey: "c".repeat(64),
          platform: "alipay",
          sourcePackage: "com.eg.android.AlipayGphone",
          postedAt: "2026-07-15T04:30:00.000Z",
          parserId: "alipay-payment-success",
          parserVersion: 1,
          evidenceDigest: "d".repeat(64),
          confidenceBasisPoints: 9_000,
          facts: { amountMinor: 3_580, merchantName: null },
        },
      ],
    })).items[0]! as AcceptedIngestItem;
    const posted = captureService.confirm(
      "import-user",
      accepted.captureId!,
      { decision: "post" },
    );
    expect(posted).toMatchObject({
      status: "completed",
      outcome: { outcome: "posted" },
    });
    if (!("outcome" in posted) || !posted.outcome) {
      throw new Error("expected a completed notification posting");
    }
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status,Payment method",
      "ALI-ENRICH-POSTED,2026-07-15 12:30:00,Mountain Cafe,Latte coffee,35.80,Expense,Transaction successful,Alipay balance",
    ].join("\n");

    const staged = await service.upload(
      "import-user",
      new File([csv], "enrich-posted.csv", { type: "text/csv" }),
    );
    expect(service.getReview("import-user", staged.batchId).items[0]).toMatchObject({
      enrichmentData: {
        status: "ready",
        targetKind: "transaction",
        targetId: posted.outcome.transactionId,
      },
    });

    const completed = service.confirm("import-user", staged.batchId);
    expect(completed.batch).toMatchObject({
      importedCount: 1,
      createdCount: 0,
      enrichedCount: 1,
    });
    expect(completed.items[0]).toMatchObject({
      resultCode: "ENRICHED_TRANSACTION",
      resultTransactionId: posted.outcome.transactionId,
    });
    expect(
      database.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, posted.outcome.transactionId!))
        .get(),
    ).toMatchObject({
      source: "alipay",
      platformTransactionId: null,
      merchantName: "Mountain Cafe",
      description: "Latte coffee",
      paymentMethod: "Alipay balance",
      revisionNumber: 2,
    });
    expect(database.db.select().from(transactionSupplementalEvidence).all()).toEqual([
      expect.objectContaining({
        transactionId: posted.outcome.transactionId,
        platformTransactionId: "ALI-ENRICH-POSTED",
      }),
    ]);
    expect(
      database.db.select().from(transactionRevisions).all().at(-1),
    ).toMatchObject({
      kind: "amendment",
      provenanceSnapshot: {
        kind: "notification_capture",
        captureId: accepted.captureId,
      },
    });

    const repeated = await service.upload(
      "import-user",
      new File([csv], "enrich-posted-again.csv", { type: "text/csv" }),
    );
    expect(service.getReview("import-user", repeated.batchId).items[0]).toMatchObject({
      enrichmentData: null,
      duplicateStatus: "duplicate",
      decision: "skip",
    });
    service.confirm("import-user", repeated.batchId);
    expect(database.db.select().from(transactionRevisions).all()).toHaveLength(2);
    expect(
      database.db.select().from(transactionSupplementalEvidence).all(),
    ).toHaveLength(1);
  });

  it("requires an explicit per-field choice before bill data can replace user content", async () => {
    const captureService = createNotificationCaptureService(database.db);
    const accepted = (await captureService.ingest("import-user", {
      events: [
        {
          idempotencyKey: "e".repeat(64),
          platform: "alipay",
          sourcePackage: "com.eg.android.AlipayGphone",
          postedAt: "2026-07-15T04:30:00.000Z",
          parserId: "alipay-payment-success",
          parserVersion: 1,
          evidenceDigest: "f".repeat(64),
          confidenceBasisPoints: 9_000,
          facts: { amountMinor: 3_580, merchantName: null },
        },
      ],
    })).items[0]! as AcceptedIngestItem;
    captureService.edit("import-user", accepted.captureId!, {
      amountMinor: 3_580,
      merchantName: "My confirmed merchant",
      description: "Alipay payment notification",
      categoryId: null,
      transactionTime: "2026-07-15T04:30:00.000Z",
      paymentMethod: "Alipay",
    });
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status,Payment method",
      "ALI-ENRICH-CONFLICT,2026-07-15 12:30:00,Statement merchant,Latte coffee,35.80,Expense,Transaction successful,Alipay balance",
    ].join("\n");

    const staged = await service.upload(
      "import-user",
      new File([csv], "enrich-conflict.csv", { type: "text/csv" }),
    );
    const item = service.getReview("import-user", staged.batchId).items[0]!;
    expect(item).toMatchObject({
      decision: "pending",
      enrichmentData: {
        status: "conflict",
        conflicts: ["merchantName", "description", "paymentMethod"],
        current: { merchantName: "My confirmed merchant" },
        proposed: { merchantName: "Statement merchant" },
      },
    });
    expect(() =>
      service.setItemDecision(
        "import-user",
        staged.batchId,
        item.id,
        "import",
      ),
    ).toThrow("Choose the current or statement value for each field first");
    expect(() => service.confirm("import-user", staged.batchId)).toThrow(
      "Some possible duplicates still need a decision",
    );

    service.setEnrichmentResolution(
      "import-user",
      staged.batchId,
      item.id,
      {
        merchantName: "keep_current",
        description: "use_bill",
        paymentMethod: "use_bill",
      },
    );
    expect(service.getReview("import-user", staged.batchId).items[0]).toMatchObject({
      decision: "import",
      enrichmentData: {
        status: "ready",
        resolutions: {
          merchantName: "keep_current",
          description: "use_bill",
          paymentMethod: "use_bill",
        },
      },
    });
    service.confirm("import-user", staged.batchId);
    expect(database.db.select().from(transactions).get()).toMatchObject({
      merchantName: "My confirmed merchant",
      description: "Latte coffee",
      paymentMethod: "Alipay balance",
    });
  });

  it("never auto-selects among multiple notification targets in the five-minute window", async () => {
    const captureService = createNotificationCaptureService(database.db);
    for (const [index, postedAt] of [
      "2026-07-15T04:26:00.000Z",
      "2026-07-15T04:34:00.000Z",
    ].entries()) {
      await captureService.ingest("import-user", {
        events: [
          {
            idempotencyKey: String(index + 1).repeat(64),
            platform: "alipay",
            sourcePackage: "com.eg.android.AlipayGphone",
            postedAt,
            parserId: "alipay-payment-success",
            parserVersion: 1,
            evidenceDigest: String(index + 3).repeat(64),
            confidenceBasisPoints: 9_000,
            facts: { amountMinor: 3_580, merchantName: null },
          },
        ],
      });
    }
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-AMBIGUOUS,2026-07-15 12:30:00,Mountain Cafe,Latte,35.80,Expense,Transaction successful",
    ].join("\n");

    const staged = await service.upload(
      "import-user",
      new File([csv], "ambiguous.csv", { type: "text/csv" }),
    );
    expect(service.getReview("import-user", staged.batchId).items[0]).toMatchObject({
      decision: "pending",
      duplicateStatus: "possible_duplicate",
      enrichmentData: {
        status: "ambiguous",
        targetId: null,
        candidateTargetIds: expect.arrayContaining([
          expect.any(String),
          expect.any(String),
        ]),
      },
    });
  });

  it("never assigns the same notification target to multiple bill rows", async () => {
    await createNotificationCaptureService(database.db).ingest("import-user", {
      events: [
        {
          idempotencyKey: "9".repeat(64),
          platform: "alipay",
          sourcePackage: "com.eg.android.AlipayGphone",
          postedAt: "2026-07-15T04:30:00.000Z",
          parserId: "alipay-payment-success",
          parserVersion: 1,
          evidenceDigest: "a".repeat(64),
          confidenceBasisPoints: 9_000,
          facts: { amountMinor: 3_580, merchantName: null },
        },
      ],
    });
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-SAME-TARGET-1,2026-07-15 12:30:00,Mountain Cafe,Latte,35.80,Expense,Transaction successful",
      "ALI-SAME-TARGET-2,2026-07-15 12:31:00,Mountain Cafe,Refill,35.80,Expense,Transaction successful",
    ].join("\n");

    const staged = await service.upload(
      "import-user",
      new File([csv], "same-target.csv", { type: "text/csv" }),
    );
    const review = service.getReview("import-user", staged.batchId);
    expect(
      review.items.map((item) => ({
        status: item.enrichmentData?.status,
        decision: item.decision,
        duplicateStatus: item.duplicateStatus,
      })),
    ).toEqual([
      {
        status: "ambiguous",
        decision: "pending",
        duplicateStatus: "possible_duplicate",
      },
      {
        status: "ambiguous",
        decision: "pending",
        duplicateStatus: "possible_duplicate",
      },
    ]);
  });

  it("rolls back a mixed batch when an enrichment target changes after review", async () => {
    const captureService = createNotificationCaptureService(database.db);
    const accepted = (await captureService.ingest("import-user", {
      events: [
        {
          idempotencyKey: "7".repeat(64),
          platform: "alipay",
          sourcePackage: "com.eg.android.AlipayGphone",
          postedAt: "2026-07-15T04:30:00.000Z",
          parserId: "alipay-payment-success",
          parserVersion: 1,
          evidenceDigest: "8".repeat(64),
          confidenceBasisPoints: 9_000,
          facts: { amountMinor: 3_580, merchantName: null },
        },
      ],
    })).items[0]! as AcceptedIngestItem;
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-ATOMIC-ENRICH,2026-07-15 12:30:00,Mountain Cafe,Latte,35.80,Expense,Transaction successful",
      "ALI-ATOMIC-NEW,2026-07-15 15:00:00,Regular merchant,Lunch,12.00,Expense,Transaction successful",
    ].join("\n");
    const staged = await service.upload(
      "import-user",
      new File([csv], "atomic-enrichment.csv", { type: "text/csv" }),
    );
    expect(service.getReview("import-user", staged.batchId).decisionCounts.import).toBe(2);

    captureService.edit("import-user", accepted.captureId!, {
      amountMinor: 3_580,
      merchantName: "Later merchant edit",
      description: "Alipay payment notification",
      categoryId: null,
      transactionTime: "2026-07-15T04:30:00.000Z",
      paymentMethod: "Alipay",
    });

    expect(() => service.confirm("import-user", staged.batchId)).toThrow(
      "Notification candidate changed. Review the statement again",
    );
    expect(database.db.select().from(transactions).all()).toHaveLength(0);
    expect(
      database.db.select().from(transactionSupplementalEvidence).all(),
    ).toHaveLength(0);
    expect(service.getReview("import-user", staged.batchId).batch.status).toBe(
      "reviewing",
    );
  });

  it("matches the inclusive five-minute boundary but not a later or amount-mismatched row", async () => {
    const captureService = createNotificationCaptureService(database.db);
    for (const [index, amountMinor, postedAt] of [
      [0, 1_000, "2026-07-15T04:25:00.000Z"],
      [1, 2_000, "2026-07-15T04:24:59.000Z"],
    ] as const) {
      await captureService.ingest("import-user", {
        events: [
          {
            idempotencyKey: String(index + 3).repeat(64),
            platform: "alipay",
            sourcePackage: "com.eg.android.AlipayGphone",
            postedAt,
            parserId: "alipay-payment-success",
            parserVersion: 1,
            evidenceDigest: String(index + 5).repeat(64),
            confidenceBasisPoints: 9_000,
            facts: { amountMinor, merchantName: null },
          },
        ],
      });
    }
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-BOUNDARY,2026-07-15 12:30:00,Boundary merchant,Item,10.00,Expense,Transaction successful",
      "ALI-OUTSIDE,2026-07-15 12:30:00,Timeout merchant,Item,20.00,Expense,Transaction successful",
      "ALI-AMOUNT,2026-07-15 12:25:00,Different amount,Item,11.00,Expense,Transaction successful",
    ].join("\n");

    const staged = await service.upload(
      "import-user",
      new File([csv], "boundary.csv", { type: "text/csv" }),
    );
    const items = service.getReview("import-user", staged.batchId).items;
    expect(items.map((item) => item.enrichmentData?.status ?? null)).toEqual([
      "ready",
      null,
      null,
    ]);
  });

  it("requires an explicit decision for possible duplicates", async () => {
    const existing = {
      source: "manual" as const,
      type: "expense" as const,
      amountMinor: 3580,
      currency: "CNY",
      merchantName: "Mountain Cafe",
      description: "Manual entry",
      transactionTime: "2026-07-15T04:32:00.000Z",
    };
    database.db
      .insert(transactions)
      .values({
        id: "manual-existing",
        userId: "import-user",
        ...existing,
        categoryId: "food",
        createdAt: "2026-07-15T04:32:00.000Z",
        updatedAt: "2026-07-15T04:32:00.000Z",
        fingerprint: createTransactionFingerprint(existing),
        duplicateStatus: "unique",
        needsReview: false,
      })
      .run();
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-POSSIBLE,2026-07-15 12:30:00,Mountain Cafe,Latte,35.80,Expense,Transaction successful",
    ].join("\n");

    const skippedBatch = await service.upload(
      "import-user",
      new File([csv], "possible.csv", { type: "text/csv" }),
    );
    const skippedReview = service.getReview("import-user", skippedBatch.batchId);
    const skippedItem = skippedReview.items[0]!;
    expect(skippedItem.duplicateStatus).toBe("possible_duplicate");
    expect(skippedItem.decision).toBe("pending");
    expect(
      service.getNextUnresolvedDuplicate(
        "import-user",
        skippedBatch.batchId,
      ),
    ).toMatchObject({
      item: {
        id: skippedItem.id,
        rowNumber: 3,
        duplicateTransactionId: "manual-existing",
      },
      matchedItem: null,
    });
    expect(() => service.confirm("import-user", skippedBatch.batchId)).toThrow(
      "Some possible duplicates still need a decision",
    );
    expect(
      service.setItemDecision(
        "import-user",
        skippedBatch.batchId,
        skippedItem.id,
        "import",
      ),
    ).toBe("pending");
    service.setItemDecision(
      "import-user",
      skippedBatch.batchId,
      skippedItem.id,
      "skip",
    );
    expect(
      service.getNextUnresolvedDuplicate(
        "import-user",
        skippedBatch.batchId,
      ),
    ).toBeNull();
    expect(service.confirm("import-user", skippedBatch.batchId).batch.importedCount).toBe(0);

    const overrideBatch = await service.upload(
      "import-user",
      new File([csv], "possible-override.csv", { type: "text/csv" }),
    );
    const overrideItem = service.getReview("import-user", overrideBatch.batchId).items[0]!;
    expect(
      service.setItemDecision(
        "import-user",
        overrideBatch.batchId,
        overrideItem.id,
        "import_anyway",
      ),
    ).toBe("import_anyway");
    expect(service.confirm("import-user", overrideBatch.batchId).batch.importedCount).toBe(1);
    const imported = database.db
      .select()
      .from(transactions)
      .where(eq(transactions.platformTransactionId, "ALI-POSSIBLE"))
      .get();
    expect(imported).toMatchObject({
      duplicateStatus: "possible_duplicate",
      needsReview: false,
    });
  });

  it("surfaces a possible duplicate discovered inside the confirmation cohort", async () => {
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-COHORT-1,2026-07-15 12:30:00,Group red packet sent,Red packets A,100.00,Expense,Transaction successful",
      "ALI-COHORT-2,2026-07-15 12:31:06,Group red packet sent,Red packets B,100.00,Expense,Transaction successful",
    ].join("\n");
    const staged = await service.upload(
      "import-user",
      new File([csv], "cohort-possible.csv", { type: "text/csv" }),
    );
    expect(service.getReview("import-user", staged.batchId).items).toMatchObject([
      { rowNumber: 3, decision: "import", duplicateStatus: "unique" },
      { rowNumber: 4, decision: "import", duplicateStatus: "unique" },
    ]);

    expect(() => service.confirm("import-user", staged.batchId)).toThrowError(
      expect.objectContaining({
        name: "ImportServiceError",
        code: "UNRESOLVED_DUPLICATES",
      }),
    );
    const pending = service.getReview("import-user", staged.batchId, {
      filter: "pending",
    });
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0]).toMatchObject({
      rowNumber: 4,
      decision: "pending",
      duplicateStatus: "possible_duplicate",
      duplicateTransactionId: null,
      warnings: [
        {
          code: "DUPLICATE_MATCH",
          message: "May match batch row 3 as the same transaction",
        },
      ],
    });
    expect(
      service.getNextUnresolvedDuplicate("import-user", staged.batchId),
    ).toMatchObject({
      item: { rowNumber: 4, decision: "pending" },
      matchedItem: {
        rowNumber: 3,
        normalizedData: {
          merchantName: "Group red packet sent",
          amountMinor: 10_000,
        },
      },
    });

    // Older imports stored only a source-language message, without match IDs.
    for (const message of [
      "与本批次第 3 行可能为同一笔交易",
      "May match batch row 3 as the same transaction",
    ]) {
      database.db.update(importItems).set({
        warnings: [{ code: "DUPLICATE_MATCH", message }],
      }).where(eq(importItems.id, pending.items[0]!.id)).run();
      expect(service.getNextUnresolvedDuplicate("import-user", staged.batchId))
        .toMatchObject({ matchedItem: { rowNumber: 3 } });
    }

    service.setItemDecision(
      "import-user",
      staged.batchId,
      pending.items[0]!.id,
      "import_anyway",
    );
    expect(
      service.getNextUnresolvedDuplicate("import-user", staged.batchId),
    ).toBeNull();
    expect(service.confirm("import-user", staged.batchId).batch.importedCount).toBe(
      2,
    );
  });

  it("rechecks exact duplicates inside the confirmation transaction", async () => {
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-TOCTOU,2026-07-15 10:00:00,Test merchant,Test item,10.00,Expense,Transaction successful",
    ].join("\n");
    const staged = await service.upload(
      "import-user",
      new File([csv], "toctou.csv", { type: "text/csv" }),
    );
    expect(service.getReview("import-user", staged.batchId).decisionCounts.import).toBe(1);

    const concurrent = {
      source: "alipay" as const,
      type: "expense" as const,
      amountMinor: 1000,
      currency: "CNY",
      merchantName: "Test merchant",
      description: "Test item",
      transactionTime: "2026-07-15T02:00:00.000Z",
    };
    database.db
      .insert(transactions)
      .values({
        id: "concurrent-import",
        userId: "import-user",
        ...concurrent,
        platformTransactionId: "ALI-TOCTOU",
        createdAt: "2026-07-15T02:00:00.000Z",
        updatedAt: "2026-07-15T02:00:00.000Z",
        fingerprint: createTransactionFingerprint(concurrent),
        duplicateStatus: "unique",
        needsReview: false,
      })
      .run();

    const result = service.confirm("import-user", staged.batchId);
    expect(result.batch.importedCount).toBe(0);
    expect(result.batch.duplicateCount).toBe(1);
    expect(
      database.db
        .select()
        .from(transactions)
        .where(eq(transactions.platformTransactionId, "ALI-TOCTOU"))
        .all(),
    ).toHaveLength(1);
  });

  it("reparses generic files after a validated field mapping update", async () => {
    const csv = [
      "When,Direction,Value,Who,Note",
      "2026-07-15 12:00:00,expense,12.30,Test merchant,Lunch",
    ].join("\n");
    const staged = await service.upload(
      "import-user",
      new File([csv], "generic.csv", { type: "text/csv" }),
    );
    expect(service.getReview("import-user", staged.batchId).batch.validCount).toBe(0);

    await expect(
      service.updateMapping("import-user", staged.batchId, {
        amount: "missing-header",
      }),
    ).rejects.toThrow("Field mapping contains unknown headers");

    await service.updateMapping("import-user", staged.batchId, {
      transactionTime: "When",
      type: "Direction",
      amount: "Value",
      merchantName: "Who",
      description: "Note",
    });
    const remapped = service.getReview("import-user", staged.batchId);
    expect(remapped.batch.validCount).toBe(1);
    expect(remapped.decisionCounts.import).toBe(1);
    expect(remapped.items[0]?.normalizedData).toMatchObject({
      amountMinor: 1230,
      merchantName: "Test merchant",
    });
  });

  it("does not use default-skipped rows as in-batch duplicate baselines", async () => {
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-REOPENED,2026-07-15 10:00:00,Test merchant,Closed order,10.00,Expense,Transaction closed",
      "ALI-REOPENED,2026-07-15 10:00:00,Test merchant,Successful order,10.00,Expense,Transaction successful",
    ].join("\n");
    const staged = await service.upload(
      "import-user",
      new File([csv], "reopened.csv", { type: "text/csv" }),
    );
    const review = service.getReview("import-user", staged.batchId);

    expect(review.items.map((item) => item.decision)).toEqual(["skip", "import"]);
    expect(review.items[1]?.duplicateStatus).toBe("unique");
    expect(service.confirm("import-user", staged.batchId).batch.importedCount).toBe(1);
  });

  it("requires invalid rows to be corrected or explicitly skipped", async () => {
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-INVALID,2026-07-15 10:00:00,Money fund,Demand deposit,100.00,/,Transaction successful",
      "ALI-VALID,2026-07-15 11:00:00,Test merchant,Lunch,12.00,Expense,Transaction successful",
    ].join("\n");
    const staged = await service.upload(
      "import-user",
      new File([csv], "invalid-row.csv", { type: "text/csv" }),
    );

    const review = service.getReview("import-user", staged.batchId);
    expect(review.issueCounts).toEqual({
      invalid: 1,
      unresolvedInvalid: 1,
      unresolvedDuplicate: 0,
      unresolvedEnrichment: 0,
    });
    expect(review.items[0]).toMatchObject({
      rowNumber: 3,
      decision: "pending",
      validationErrors: [
        {
          field: "type",
          code: "MISSING_TYPE",
          message: "Cannot determine transaction type",
        },
      ],
    });
    expect(
      service.getNextUnresolvedError("import-user", staged.batchId),
    ).toMatchObject({
      rowNumber: 3,
      decision: "pending",
      validationErrors: [{ code: "MISSING_TYPE" }],
    });

    const errorsOnly = service.getReview("import-user", staged.batchId, {
      filter: "errors",
    });
    expect(errorsOnly.items).toHaveLength(1);
    expect(errorsOnly.items[0]?.rowNumber).toBe(3);
    expect(errorsOnly.pagination.filter).toBe("errors");
    expect(() => service.confirm("import-user", staged.batchId)).toThrow(
      "Row 3: Cannot determine transaction type. Correct it manually or skip",
    );

    service.setItemDecision(
      "import-user",
      staged.batchId,
      errorsOnly.items[0]!.id,
      "skip",
    );
    expect(
      service.getNextUnresolvedError("import-user", staged.batchId),
    ).toBeNull();
    const result = service.confirm("import-user", staged.batchId);
    expect(result.batch.importedCount).toBe(1);
    expect(result.batch.failedCount).toBe(1);
    expect(result.items.find((item) => item.rowNumber === 3)).toMatchObject({
      decision: "skip",
      resultCode: "SKIPPED_INVALID",
    });
  });

  it("normalizes edited instants and rejects a mismatched category kind", async () => {
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-KIND-TIME,2026-07-01 00:30:00,Test merchant,Test item,10.00,Expense,Transaction successful",
    ].join("\n");
    const staged = await service.upload(
      "import-user",
      new File([csv], "kind-time.csv", { type: "text/csv" }),
    );
    const item = service.getReview("import-user", staged.batchId).items[0]!;
    const edit = {
      type: "expense" as const,
      amount: "10.00",
      currency: "CNY",
      merchantName: "Test merchant",
      description: "Test item",
      categoryId: "salary",
      transactionTime: "2026-07-01T00:30:00+08:00",
      paymentMethod: null,
      platformTransactionId: "ALI-KIND-TIME",
      status: "Transaction successful",
      decision: "import" as const,
    };

    expect(() =>
      service.updateItem("import-user", staged.batchId, item.id, edit),
    ).toThrowError(
      expect.objectContaining({ code: "CATEGORY_KIND_MISMATCH", status: 422 }),
    );

    const updated = service.updateItem(
      "import-user",
      staged.batchId,
      item.id,
      { ...edit, categoryId: "food" },
    );
    expect(updated.normalizedData).toMatchObject({
      transactionTime: "2026-06-30T16:30:00.000Z",
    });
    expect(service.confirm("import-user", staged.batchId).batch.importedCount).toBe(1);
    expect(
      database.db
        .select({ transactionTime: transactions.transactionTime })
        .from(transactions)
        .where(eq(transactions.platformTransactionId, "ALI-KIND-TIME"))
        .get()?.transactionTime,
    ).toBe("2026-06-30T16:30:00.000Z");
  });

  it("enriches only local-rule fallbacks, auto-applies high confidence, and keeps ambiguous suggestions reviewable", async () => {
    database.db
      .insert(merchantCategoryRules)
      .values({
        id: "keep-other-rule",
        userId: "import-user",
        categoryId: "other",
        normalizedMerchantName: "fixed other merchant",
        matchType: "exact",
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
      })
      .run();
    const provider = new ImportAiProvider();
    const aiService = createImportService(
      database.db,
      createLocalFileStorage(database.db),
      aiRuntime(provider),
    );
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-AI-1,2026-07-15 12:30:00,Lumora Joy Shop,Default item,12.80,Expense,Transaction successful",
      "ALI-AI-2,2026-07-15 13:30:00,Lakeside ELEVEN 7,Default item,23.00,Expense,Transaction successful",
      "ALI-AI-3,2026-07-15 14:30:00,Mountain Cafe,Latte,35.80,Expense,Transaction successful",
      "ALI-AI-4,2026-07-15 15:30:00,Fixed other merchant,Default item,18.00,Expense,Transaction successful",
    ].join("\n");
    const staged = await aiService.upload(
      "import-user",
      new File([csv], "ai-categories.csv", { type: "text/csv" }),
    );

    await expect(
      aiService.classifyWithAi("import-user", staged.batchId, "zh"),
    ).resolves.toMatchObject({
      enabled: true,
      failed: false,
      processed: 2,
      autoApplied: 1,
      needsReview: 1,
      remaining: 0,
    });
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.locale).toBe("zh");
    expect(provider.calls[0]!.items.map((item) => item.merchantName)).toEqual([
      "Lumora Joy Shop",
      "Lakeside ELEVEN 7",
    ]);

    const review = aiService.getReview("import-user", staged.batchId);
    const tea = review.items.find(
      (item) =>
        (item.normalizedData as { merchantName?: string } | null)?.merchantName ===
        "Lumora Joy Shop",
    )!;
    const seven = review.items.find(
      (item) =>
        (item.normalizedData as { merchantName?: string } | null)?.merchantName ===
        "Lakeside ELEVEN 7",
    )!;
    const coffee = review.items.find(
      (item) =>
        (item.normalizedData as { merchantName?: string } | null)?.merchantName ===
        "Mountain Cafe",
    )!;
    const learnedOther = review.items.find(
      (item) =>
        (item.normalizedData as { merchantName?: string } | null)?.merchantName ===
        "Fixed other merchant",
    )!;
    expect(tea.normalizedData).toMatchObject({
      categoryId: "food",
      categorySuggestion: { status: "auto_applied", confidence: 0.98 },
    });
    expect(seven.normalizedData).toMatchObject({
      categoryId: "other",
      categorySuggestion: {
        categoryId: "food",
        status: "needs_review",
        ambiguous: true,
      },
    });
    expect(coffee.normalizedData).toMatchObject({ categoryId: "food" });
    expect(
      (coffee.normalizedData as { categorySuggestion?: unknown })
        .categorySuggestion,
    ).toBeUndefined();
    expect(learnedOther.normalizedData).toMatchObject({ categoryId: "other" });
    expect(
      (learnedOther.normalizedData as { categorySuggestion?: unknown })
        .categorySuggestion,
    ).toBeUndefined();

    expect(
      aiService.adoptAiCategorySuggestion(
        "import-user",
        staged.batchId,
        seven.id,
      ).normalizedData,
    ).toMatchObject({
      categoryId: "food",
      categorySuggestion: { status: "adopted" },
    });

    const teaData = tea.normalizedData as {
      type: "expense";
      amount: string;
      currency: string;
      description: string | null;
      transactionTime: string;
      paymentMethod: string | null;
      platformTransactionId: string | null;
      status: string | null;
    };
    const editedTea = aiService.updateItem(
      "import-user",
      staged.batchId,
      tea.id,
      {
        type: teaData.type,
        amount: teaData.amount,
        currency: teaData.currency,
        merchantName: "Updated Joy Shop",
        description: teaData.description,
        categoryId: null,
        transactionTime: teaData.transactionTime,
        paymentMethod: teaData.paymentMethod,
        platformTransactionId: teaData.platformTransactionId,
        status: teaData.status,
        decision: "import",
      },
    );
    expect(editedTea.normalizedData).toMatchObject({
      merchantName: "Updated Joy Shop",
      categoryId: "other",
    });
    expect(
      (editedTea.normalizedData as { categorySuggestion?: unknown })
        .categorySuggestion,
    ).toBeUndefined();
    expect(database.db.select().from(merchantCategoryRules).all()).toHaveLength(1);
    expect(aiService.confirm("import-user", staged.batchId).batch.importedCount).toBe(4);
  });

  it("keeps file review and posting available when the AI provider fails", async () => {
    const aiService = createImportService(
      database.db,
      createLocalFileStorage(database.db),
      aiRuntime(new FailingImportAiProvider()),
    );
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-AI-FAIL,2026-07-15 12:30:00,Lumora Joy Shop,Default item,12.80,Expense,Transaction successful",
    ].join("\n");
    const staged = await aiService.upload(
      "import-user",
      new File([csv], "ai-provider-failure.csv", { type: "text/csv" }),
    );

    await expect(
      aiService.classifyWithAi("import-user", staged.batchId),
    ).resolves.toMatchObject({
      enabled: true,
      failed: true,
      errorCode: "PROVIDER_REQUEST_FAILED",
      processed: 0,
      remaining: 1,
    });
    expect(
      aiService.getReview("import-user", staged.batchId).items[0]!
        .normalizedData,
    ).toMatchObject({ categoryId: "other" });
    expect(aiService.confirm("import-user", staged.batchId).batch.importedCount).toBe(1);
  });

  it("resolves the current user runtime again and replaces stale staged suggestions", async () => {
    const firstProvider = new ImportAiProvider();
    const secondProvider = new ImportAiProvider();
    let currentRuntime = aiRuntime(firstProvider, "1".repeat(64));
    const aiService = createImportService(
      database.db,
      createLocalFileStorage(database.db),
      () => currentRuntime,
    );
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-AI-DYNAMIC,2026-07-15 12:30:00,Lumora Joy Shop,Default item,12.80,Expense,Transaction successful",
    ].join("\n");
    const staged = await aiService.upload(
      "import-user",
      new File([csv], "dynamic-ai.csv", { type: "text/csv" }),
    );

    await aiService.classifyWithAi("import-user", staged.batchId);
    currentRuntime = aiRuntime(secondProvider, "2".repeat(64));
    expect(
      aiService.getReview("import-user", staged.batchId).items[0]
        ?.normalizedData,
    ).toMatchObject({ categoryId: "other" });
    expect(
      (
        aiService.getReview("import-user", staged.batchId).items[0]
          ?.normalizedData as { categorySuggestion?: unknown }
      ).categorySuggestion,
    ).toBeUndefined();
    await aiService.classifyWithAi("import-user", staged.batchId);

    expect(firstProvider.calls).toHaveLength(1);
    expect(secondProvider.calls).toHaveLength(1);
    expect(
      aiService.getReview("import-user", staged.batchId).items[0]
        ?.normalizedData,
    ).toMatchObject({
      categorySuggestion: {
        configurationFingerprint: "2".repeat(64),
      },
    });
  });

  it("posts Other instead of an auto-applied suggestion made by a stale configuration", async () => {
    const provider = new ImportAiProvider();
    let currentRuntime = aiRuntime(provider, "1".repeat(64));
    const aiService = createImportService(
      database.db,
      createLocalFileStorage(database.db),
      () => currentRuntime,
    );
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-AI-STALE,2026-07-15 12:30:00,Lumora Joy Shop,Default item,12.80,Expense,Transaction successful",
    ].join("\n");
    const staged = await aiService.upload(
      "import-user",
      new File([csv], "stale-ai.csv", { type: "text/csv" }),
    );
    await aiService.classifyWithAi("import-user", staged.batchId);
    currentRuntime = aiRuntime(provider, "2".repeat(64));

    aiService.confirm("import-user", staged.batchId);

    expect(
      database.db
        .select({ categoryId: transactions.categoryId })
        .from(transactions)
        .where(eq(transactions.platformTransactionId, "ALI-AI-STALE"))
        .get(),
    ).toEqual({ categoryId: "other" });
  });

  it("records every IMPORTED and SKIPPED_* result code and outcome column on confirm", async () => {
    const existing = {
      source: "alipay" as const,
      type: "expense" as const,
      amountMinor: 4200,
      currency: "CNY",
      merchantName: "Harbor Bakery",
      transactionTime: "2026-07-16T02:00:00.000Z",
    };
    database.db
      .insert(transactions)
      .values({
        id: "existing-pin-tx",
        userId: "import-user",
        ...existing,
        description: "Existing bun",
        categoryId: "food",
        platformTransactionId: "ALI-PIN-DUP",
        createdAt: existing.transactionTime,
        updatedAt: existing.transactionTime,
        fingerprint: createTransactionFingerprint(existing),
        duplicateStatus: "unique",
        needsReview: false,
      })
      .run();

    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-PIN-OK,2026-07-16 09:00:00,Cedar Tea House,Green tea,18.00,Expense,Transaction successful",
      "ALI-PIN-DUP,2026-07-16 10:00:00,Harbor Bakery,Existing bun,42.00,Expense,Transaction successful",
      "ALI-PIN-POSS-SKIP,2026-07-16 10:02:00,Harbor Bakery,Another bun,42.00,Expense,Transaction successful",
      "ALI-PIN-POSS-OVERRIDE,2026-07-16 10:03:00,Harbor Bakery,Override bun,42.00,Expense,Transaction successful",
      "ALI-PIN-USER-SKIP,2026-07-16 11:00:00,Maple Bookshop,Notebook,25.00,Expense,Transaction successful",
      "ALI-PIN-INVALID,2026-07-16 12:00:00,Broken Row Shop,Missing type,15.00,UnknownType,Transaction successful",
    ].join("\n");
    const staged = await service.upload(
      "import-user",
      new File([csv], "result-codes.csv", { type: "text/csv" }),
    );
    const review = service.getReview("import-user", staged.batchId);
    const byRow = new Map(review.items.map((item) => [item.rowNumber, item]));

    service.setItemDecision("import-user", staged.batchId, byRow.get(5)!.id, "skip");
    service.setItemDecision(
      "import-user",
      staged.batchId,
      byRow.get(6)!.id,
      "import_anyway",
    );
    service.setItemDecision("import-user", staged.batchId, byRow.get(7)!.id, "skip");
    service.setItemDecision("import-user", staged.batchId, byRow.get(8)!.id, "skip");

    const completed = service.confirm("import-user", staged.batchId);
    const resultsByRow = new Map(
      completed.items.map((item) => [item.rowNumber, item]),
    );

    expect(resultsByRow.get(3)).toMatchObject({
      resultCode: "IMPORTED",
      duplicateStatus: "unique",
      duplicateTransactionId: null,
      decision: "import",
    });
    expect(resultsByRow.get(3)?.resultTransactionId).toBeTruthy();

    expect(resultsByRow.get(4)).toMatchObject({
      resultCode: "SKIPPED_DUPLICATE",
      resultTransactionId: null,
      duplicateStatus: "duplicate",
      duplicateTransactionId: "existing-pin-tx",
      decision: "skip",
    });

    expect(resultsByRow.get(5)).toMatchObject({
      resultCode: "SKIPPED_POSSIBLE_DUPLICATE",
      resultTransactionId: null,
      duplicateStatus: "possible_duplicate",
      duplicateTransactionId: "existing-pin-tx",
      decision: "skip",
    });

    expect(resultsByRow.get(6)).toMatchObject({
      resultCode: "IMPORTED",
      duplicateStatus: "possible_duplicate",
      duplicateTransactionId: "existing-pin-tx",
      decision: "import_anyway",
    });
    expect(resultsByRow.get(6)?.resultTransactionId).toBeTruthy();

    expect(resultsByRow.get(7)).toMatchObject({
      resultCode: "SKIPPED_BY_USER",
      resultTransactionId: null,
      duplicateStatus: "unique",
      duplicateTransactionId: null,
      decision: "skip",
    });

    expect(resultsByRow.get(8)).toMatchObject({
      resultCode: "SKIPPED_INVALID",
      resultTransactionId: null,
      decision: "skip",
    });
  });
});
