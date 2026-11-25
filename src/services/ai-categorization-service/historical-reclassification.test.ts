import path from "node:path";

import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import {
  categories,
  merchantCategoryRules,
  transactionRevisions,
  transactions,
  users,
} from "@/db/schema";
import {
  createHistoricalAiReclassificationService,
  type AiCategorizationProvider,
  type AiCategorizationRuntime,
  type AiCategoryBatchInput,
  type AiCategoryResult,
} from "@/services/ai-categorization-service";
import { createLedgerTransactionService } from "@/services/ledger-transaction";

class MerchantTestProvider implements AiCategorizationProvider {
  readonly name = "openai-compatible" as const;
  readonly model = "test-category-model";
  readonly enabled = true;
  readonly sendsDataToThirdParty = false;
  readonly calls: AiCategoryBatchInput[] = [];

  async classifyBatch(input: AiCategoryBatchInput): Promise<AiCategoryResult[]> {
    this.calls.push(structuredClone(input));
    const food = input.categories.find((category) => category.name === "Food");
    return input.items.map((item) => {
      if (/Lumora|Pho/iu.test(item.merchantName ?? item.description ?? "")) {
        return {
          itemRef: item.itemRef,
          categoryId: food?.id ?? null,
          confidence: 0.98,
          ambiguous: false,
          reason: "Tea or food shop",
        };
      }
      if (/ELEVEN/iu.test(item.merchantName ?? "")) {
        return {
          itemRef: item.itemRef,
          categoryId: food?.id ?? null,
          confidence: 0.7,
          ambiguous: true,
          reason: "Convenience stores may sell food or household goods",
        };
      }
      return {
        itemRef: item.itemRef,
        categoryId: null,
        confidence: 0.2,
        ambiguous: true,
        reason: "Insufficient information",
      };
    });
  }
}

function runtime(
  provider: MerchantTestProvider,
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

describe("historical AI reclassification", () => {
  let database: ReturnType<typeof createDatabase>;
  let provider: MerchantTestProvider;
  let service: ReturnType<typeof createHistoricalAiReclassificationService>;
  let ledger: ReturnType<typeof createLedgerTransactionService>;
  const ids: Record<string, string> = {};

  function post(input: {
    userId?: "user-a" | "user-b";
    ref: string;
    merchantName: string;
    description: string;
    amountMinor: number;
    transactionTime: string;
    categoryId?: string;
  }) {
    const userId = input.userId ?? "user-a";
    const result = ledger.confirmPosting(userId, {
      identity: { id: `confirmation-${input.ref}`, version: 1 },
      items: [
        {
          sourceItemRef: `item-${input.ref}`,
          decision: "post",
          candidate: {
            facts: {
              type: "expense",
              amountMinor: input.amountMinor,
              currency: "CNY",
              merchantName: input.merchantName,
              description: input.description,
              categoryId:
                input.categoryId ?? (userId === "user-a" ? "other-a" : "other-b"),
              transactionTime: input.transactionTime,
              paymentMethod: "WeChat Pay",
            },
            provenance: { kind: "manual" },
          },
        },
      ],
    });
    if (result.status !== "completed" || !result.items[0]?.transactionId) {
      throw new Error("test transaction was not posted");
    }
    ids[input.ref] = result.items[0].transactionId;
  }

  beforeEach(() => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    const now = "2026-07-16T00:00:00.000Z";
    database.db
      .insert(users)
      .values([
        {
          id: "user-a",
          email: "ai-a@example.com",
          passwordHash: "test",
          displayName: "AI A",
          timezone: "Asia/Shanghai",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "user-b",
          email: "ai-b@example.com",
          passwordHash: "test",
          displayName: "AI B",
          timezone: "Asia/Shanghai",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    database.db
      .insert(categories)
      .values([
        { id: "food-a", userId: "user-a", name: "Food", kind: "expense", isSystem: true, sortOrder: 0, createdAt: now, updatedAt: now },
        { id: "other-a", userId: "user-a", name: "Other", kind: "both", isSystem: true, sortOrder: 1, createdAt: now, updatedAt: now },
        { id: "food-b", userId: "user-b", name: "Food", kind: "expense", isSystem: true, sortOrder: 0, createdAt: now, updatedAt: now },
        { id: "other-b", userId: "user-b", name: "Other", kind: "both", isSystem: true, sortOrder: 1, createdAt: now, updatedAt: now },
      ])
      .run();
    ledger = createLedgerTransactionService(database.db);
    post({
      ref: "tea-1",
      merchantName: "Lumora Joy Shop",
      description: "Default item",
      amountMinor: 1_280,
      transactionTime: "2026-07-12T04:00:00.000Z",
    });
    post({
      ref: "tea-2",
      merchantName: "Lumora Joy Shop",
      description: "Default item",
      amountMinor: 1_680,
      transactionTime: "2026-07-11T04:00:00.000Z",
    });
    post({
      ref: "seven",
      merchantName: "Lakeside ELEVEN 7",
      description: "Default item",
      amountMinor: 2_300,
      transactionTime: "2026-07-10T04:00:00.000Z",
    });
    post({
      ref: "pho",
      merchantName: "Viet Pho(Riverside branch)",
      description: "Default item",
      amountMinor: 4_600,
      transactionTime: "2026-07-09T08:00:00.000Z",
    });
    post({
      userId: "user-b",
      ref: "private-b",
      merchantName: "Pho",
      description: "Lunch",
      amountMinor: 3_800,
      transactionTime: "2026-07-09T04:00:00.000Z",
    });
    post({
      ref: "already-food",
      merchantName: "Pho",
      description: "Dinner",
      amountMinor: 4_200,
      transactionTime: "2026-07-08T04:00:00.000Z",
      categoryId: "food-a",
    });
    provider = new MerchantTestProvider();
    service = createHistoricalAiReclassificationService(
      database.db,
      runtime(provider),
    );
  });

  afterEach(() => database.sqlite.close());

  it("previews only this user's Other groups, deduplicates them, and does not write", async () => {
    const revisionCount = database.db.select().from(transactionRevisions).all().length;
    const preview = await service.preview("user-a", { cursor: 0, limit: 20 });

    expect(preview.totalGroups).toBe(3);
    expect(preview.nextCursor).toBeNull();
    expect(preview.groups).toHaveLength(3);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.locale).toBe("en");
    expect(provider.calls[0]!.items).toHaveLength(3);
    expect(provider.calls[0]!.categories.map((category) => category.id)).toEqual([
      "food-a",
      "other-a",
    ]);
    expect(provider.calls[0]!.items.every((item) => /^item-\d+$/u.test(item.itemRef))).toBe(true);

    const tea = preview.groups.find((group) => group.merchantName?.includes("Lumora"));
    const seven = preview.groups.find((group) => group.merchantName?.includes("ELEVEN"));
    const pho = preview.groups.find((group) => group.merchantName?.includes("Pho"));
    expect(tea).toMatchObject({
      transactionCount: 2,
      suggestion: {
        categoryId: "food-a",
        confidence: 0.98,
        ambiguous: false,
        status: "auto_applied",
      },
    });
    expect(seven).toMatchObject({
      transactionCount: 1,
      suggestion: {
        categoryId: "food-a",
        confidence: 0.7,
        ambiguous: true,
        status: "needs_review",
      },
    });
    expect(pho).toMatchObject({
      transactionCount: 1,
      suggestion: {
        categoryId: "food-a",
        confidence: 0.98,
        ambiguous: false,
        status: "auto_applied",
      },
    });
    expect(database.db.select().from(transactionRevisions).all()).toHaveLength(
      revisionCount,
    );
    expect(
      database.db.select().from(transactions).where(eq(transactions.id, ids["private-b"]!)).get(),
    ).toMatchObject({ userId: "user-b", categoryId: "other-b" });
  });

  it("resolves the current user runtime for every historical preview", async () => {
    const firstProvider = new MerchantTestProvider();
    const secondProvider = new MerchantTestProvider();
    let currentRuntime = runtime(firstProvider, "1".repeat(64));
    const dynamicService = createHistoricalAiReclassificationService(
      database.db,
      () => currentRuntime,
    );

    await dynamicService.preview("user-a", { cursor: 0, limit: 20 });
    currentRuntime = runtime(secondProvider, "2".repeat(64));
    await dynamicService.preview("user-a", { cursor: 0, limit: 20 });

    expect(firstProvider.calls).toHaveLength(1);
    expect(secondProvider.calls).toHaveLength(1);
  });

  it("appends amendments, skips stale/cross-user changes, and learns only when asked", async () => {
    const preview = await service.preview("user-a", { cursor: 0, limit: 20 });
    const tea = preview.groups.find((group) => group.merchantName?.includes("Lumora"))!;
    const seven = preview.groups.find((group) => group.merchantName?.includes("ELEVEN"))!;
    const staleMember = tea.members[0]!;
    const stale = database.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, staleMember.transactionId))
      .get()!;
    const amendment = ledger.amendTransaction("user-a", {
      transactionId: stale.id,
      expectedRevisionId: stale.currentRevisionId!,
      operationId: "concurrent-user-edit",
      facts: {
        type: "expense",
        amountMinor: stale.amountMinor,
        currency: stale.currency,
        merchantName: stale.merchantName,
        description: "The user just changed the description",
        categoryId: "other-a",
        transactionTime: stale.transactionTime,
        paymentMethod: stale.paymentMethod,
      },
      learnCategoryRule: false,
    });
    expect(amendment.status).toBe("completed");

    const result = service.apply("user-a", {
      operationId: "history-review-1",
      changes: [
        ...tea.members.map((member) => ({
          ...member,
          categoryId: "food-a",
          learnCategoryRule: false,
        })),
        {
          transactionId: ids["private-b"]!,
          expectedRevisionId: database.db
            .select({ id: transactions.currentRevisionId })
            .from(transactions)
            .where(eq(transactions.id, ids["private-b"]!))
            .get()!.id!,
          categoryId: "food-a",
          learnCategoryRule: true,
        },
      ],
    });
    expect(result).toMatchObject({ appliedCount: 1, conflictCount: 2, failedCount: 0 });
    expect(
      database.db.select().from(transactions).where(eq(transactions.id, stale.id)).get(),
    ).toMatchObject({ categoryId: "other-a", description: "The user just changed the description" });
    const appliedTea = tea.members.find(
      (member) => member.transactionId !== staleMember.transactionId,
    )!;
    expect(
      database.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, appliedTea.transactionId))
        .get(),
    ).toMatchObject({ categoryId: "food-a", source: "manual" });
    expect(database.db.select().from(merchantCategoryRules).all()).toHaveLength(0);

    const learned = service.apply("user-a", {
      operationId: "history-review-2",
      changes: seven.members.map((member) => ({
        ...member,
        categoryId: "food-a",
        learnCategoryRule: true,
      })),
    });
    expect(learned).toMatchObject({ appliedCount: 1, conflictCount: 0, failedCount: 0 });
    expect(
      database.db
        .select()
        .from(merchantCategoryRules)
        .where(
          and(
            eq(merchantCategoryRules.userId, "user-a"),
            eq(merchantCategoryRules.categoryId, "food-a"),
          ),
        )
        .all(),
    ).toHaveLength(1);
    expect(
      database.db.select().from(transactions).where(eq(transactions.id, ids["private-b"]!)).get(),
    ).toMatchObject({ userId: "user-b", categoryId: "other-b" });
  });
});
