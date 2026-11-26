import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabase } from "@/db/client";
import { transactions, users } from "@/db/schema";
import { createTransactionFingerprint } from "@/lib/fingerprint";
import { createDeduplicationService } from "@/services/deduplication-service";

describe("deduplication service", () => {
  let database: ReturnType<typeof createDatabase>;
  let service: ReturnType<typeof createDeduplicationService>;
  const base = {
    type: "expense" as const,
    amountMinor: 3580,
    currency: "CNY",
    merchantName: "Mountain Cafe",
    description: "Latte",
    transactionTime: "2026-07-15T04:30:00.000Z",
    source: "alipay" as const,
    platformTransactionId: "ALI-001",
  };

  beforeEach(() => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    database.db
      .insert(users)
      .values({
        id: "dedupe-user",
        email: "dedupe@example.com",
        passwordHash: "test",
        displayName: "Dedupe",
        timezone: "Asia/Shanghai",
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
      })
      .run();
    database.db
      .insert(transactions)
      .values({
        id: "existing",
        userId: "dedupe-user",
        ...base,
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
        fingerprint: createTransactionFingerprint(base),
        duplicateStatus: "unique",
        needsReview: false,
      })
      .run();
    service = createDeduplicationService(database.db);
  });

  afterEach(() => database.sqlite.close());

  it("prioritizes exact platform transaction IDs", () => {
    expect(service.check("dedupe-user", base)).toMatchObject({
      status: "duplicate",
      transactionId: "existing",
      reasonCode: "same_platform_transaction_id",
      algorithmVersion: 3,
      reason: "Identical platform transaction ID",
    });
  });

  it("detects exact fingerprints without a platform ID", () => {
    expect(
      service.check("dedupe-user", { ...base, platformTransactionId: null }),
    ).toMatchObject({
      status: "duplicate",
      reason: "Identical source, amount, merchant, and time",
    });
  });

  it("marks cross-source matches within five minutes as possible duplicates", () => {
    expect(
      service.check("dedupe-user", {
        ...base,
        source: "screenshot",
        platformTransactionId: null,
        transactionTime: "2026-07-15T04:33:00.000Z",
      }),
    ).toMatchObject({
      status: "possible_duplicate",
      transactionId: "existing",
    });
  });

  it("treats the same platform transaction ID from another source as a possible duplicate", () => {
    expect(
      service.check("dedupe-user", {
        ...base,
        source: "screenshot",
        merchantName: null,
        description: null,
        transactionTime: "2026-07-16T04:30:00.000Z",
      }),
    ).toMatchObject({
      status: "possible_duplicate",
      transactionId: "existing",
      reason: "Same platform transaction ID from different import sources",
    });
  });

  it("prefers a same-source platform match when cross-source matches also exist", () => {
    const screenshotRecord = {
      ...base,
      source: "screenshot" as const,
      merchantName: null,
      description: null,
    };
    database.db
      .insert(transactions)
      .values({
        id: "existing-screenshot",
        userId: "dedupe-user",
        ...screenshotRecord,
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
        fingerprint: createTransactionFingerprint(screenshotRecord),
        duplicateStatus: "unique",
        needsReview: false,
      })
      .run();

    expect(service.check("dedupe-user", screenshotRecord)).toMatchObject({
      status: "duplicate",
      transactionId: "existing-screenshot",
      reason: "Identical platform transaction ID",
    });
  });

  it("leaves unrelated transactions unique", () => {
    expect(
      service.check("dedupe-user", {
        ...base,
        amountMinor: 9999,
        platformTransactionId: null,
      }).status,
    ).toBe("unique");
  });

  it("requires review for missing merchants and cross-channel payment alerts near an existing payment", () => {
    for (const extra of [{ merchantName: null }, { source: "cmb" as const, merchantName: "Card purchase" }]) {
      expect(service.check("dedupe-user", {
        ...base, ...extra, platformTransactionId: null, transactionTime: "2026-07-15T04:30:02.000Z",
      })).toMatchObject({ status: "possible_duplicate", transactionId: "existing" });
    }
  });

  it("does not silently discard distinct same-amount purchases", () => {
    expect(service.check("dedupe-user", {
      ...base, platformTransactionId: "ALI-002", transactionTime: "2026-07-15T04:30:02.000Z",
    })).toMatchObject({ status: "possible_duplicate" });
    expect(service.check("dedupe-user", {
      ...base, merchantName: null, platformTransactionId: null, transactionTime: "2026-07-15T04:31:00.000Z",
    })).toMatchObject({ status: "unique" });
  });

  it("caches only a positive supplemental-evidence table lookup per service instance", () => {
    const getSpy = vi.spyOn(database.db, "get");
    service.check("dedupe-user", { ...base, platformTransactionId: "ALI-CACHE-1" });
    service.check("dedupe-user", { ...base, platformTransactionId: "ALI-CACHE-2" });
    expect(getSpy).toHaveBeenCalledTimes(1);
    getSpy.mockRestore();

    database.sqlite.exec("DROP TABLE transaction_supplemental_evidence");
    const preMigrationService = createDeduplicationService(database.db);
    const preSpy = vi.spyOn(database.db, "get");
    expect(
      preMigrationService.check("dedupe-user", {
        ...base,
        amountMinor: 7777,
        platformTransactionId: "ALI-PRE-1",
      }).status,
    ).toBe("unique");
    expect(
      preMigrationService.check("dedupe-user", {
        ...base,
        amountMinor: 7777,
        platformTransactionId: "ALI-PRE-2",
      }).status,
    ).toBe("unique");
    expect(preSpy).toHaveBeenCalledTimes(2);
    preSpy.mockRestore();
  });
});
