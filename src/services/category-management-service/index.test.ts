import path from "node:path";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabase } from "@/db/client";
import {
  categories,
  importBatches,
  merchantCategoryRules,
  recognitionItems,
  recognitionJobs,
  storedFiles,
  transactions,
  users,
} from "@/db/schema";
import {
  createAccountSettingsService,
  getRecognitionProviderMetadata,
  profileSettingsInputSchema,
} from "@/services/category-management-service/account-settings";
import {
  builtInNamesInputSchema,
  categoryCreateSchema,
  MAX_CATEGORIES_PER_USER,
  categoryUpdateSchema,
} from "@/services/category-management-service/schema";
import { defaultCategoryRows } from "@/lib/default-categories";
import {
  createCategoryManagementService,
} from "@/services/category-management-service";

const now = "2026-07-15T00:00:00.000Z";

describe("category management service", () => {
  let database: ReturnType<typeof createDatabase>;
  let service: ReturnType<typeof createCategoryManagementService>;

  beforeEach(() => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    database.db
      .insert(users)
      .values([
        {
          id: "user-a",
          email: "category-a@example.com",
          passwordHash: "test",
          displayName: "A",
          timezone: "Asia/Shanghai",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "user-b",
          email: "category-b@example.com",
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
          id: "system-a",
          userId: "user-a",
          name: "Food",
          kind: "expense",
          icon: "Utensils",
          color: "#f97316",
          isSystem: true,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "custom-a",
          userId: "user-a",
          name: "Pets",
          kind: "expense",
          icon: "HeartPulse",
          color: "#10b981",
          isSystem: false,
          sortOrder: 1,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "system-b",
          userId: "user-b",
          name: "Food",
          kind: "expense",
          icon: "Utensils",
          color: "#f97316",
          isSystem: true,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    service = createCategoryManagementService(database.db);
  });

  afterEach(() => database.sqlite.close());

  it("normalizes names and rejects a case-insensitive normalized duplicate", () => {
    const created = service.create(
      "user-a",
      categoryCreateSchema.parse({
        name: "  ＰＥＴ   Care  ",
        kind: "expense",
        icon: "HeartPulse",
        color: "#ABCDEF",
      }),
    );

    expect(created).toMatchObject({
      name: "PET Care",
      color: "#abcdef",
      isSystem: false,
      sortOrder: 2,
    });
    expect(() =>
      service.create(
        "user-a",
        categoryCreateSchema.parse({ name: "pet care", kind: "both" }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "CATEGORY_NAME_CONFLICT",
        status: 409,
      }),
    );

    expect(() =>
      service.create(
        "user-b",
        categoryCreateSchema.parse({ name: "PET CARE", kind: "both" }),
      ),
    ).not.toThrow();
  });

  it("validates kind, icon, color, and refuses unknown fields", () => {
    expect(
      categoryCreateSchema.safeParse({
        name: "Reminder",
        kind: "expense",
        icon: "alarm-clock",
        color: "#64748b",
      }).success,
    ).toBe(true);
    expect(
      categoryCreateSchema.safeParse({
        name: "Test",
        kind: "unknown",
        icon: "InjectedIcon",
        color: "red",
      }).success,
    ).toBe(false);
    expect(
      categoryUpdateSchema.safeParse({ name: "Test", unexpected: true }).success,
    ).toBe(false);
    expect(categoryUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("keeps creation within the same 200-item boundary as reordering", () => {
    database.db
      .insert(categories)
      .values(
        Array.from(
          { length: MAX_CATEGORIES_PER_USER - 2 },
          (_, index) => ({
            id: `limit-category-${index}`,
            userId: "user-a",
            name: `Restricted category ${index}`,
            kind: "expense" as const,
            isSystem: false,
            sortOrder: index + 2,
            createdAt: now,
            updatedAt: now,
          }),
        ),
      )
      .run();

    expect(() =>
      service.create(
        "user-a",
        categoryCreateSchema.parse({ name: "Page 201 items", kind: "expense" }),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "CATEGORY_LIMIT_REACHED", status: 409 }),
    );
  });

  it("only allows editing a system category's appearance", () => {
    const updated = service.update(
      "user-a",
      "system-a",
      categoryUpdateSchema.parse({
        icon: "Coffee",
        color: "#123456",
      }),
    );
    expect(updated).toMatchObject({
      name: "Food",
      icon: "Coffee",
      color: "#123456",
      isSystem: true,
    });
    expect(() => service.remove("user-a", "system-a")).toThrowError(
      expect.objectContaining({
        code: "SYSTEM_CATEGORY_DELETE_FORBIDDEN",
      }),
    );
    expect(() =>
      service.update(
        "user-a",
        "system-a",
        categoryUpdateSchema.parse({ name: "Everyday dining" }),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "SYSTEM_CATEGORY_NAME_IMMUTABLE" }),
    );
    expect(() =>
      service.update(
        "user-a",
        "system-a",
        categoryUpdateSchema.parse({ kind: "income" }),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "SYSTEM_CATEGORY_KIND_IMMUTABLE" }),
    );
  });

  it("isolates updates and ordering by user", () => {
    expect(() =>
      service.update(
        "user-a",
        "system-b",
        categoryUpdateSchema.parse({ name: "Unauthorized edit" }),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "CATEGORY_NOT_FOUND", status: 404 }),
    );
    expect(() => service.reorder("user-a", ["custom-a", "system-b"])).toThrowError(
      expect.objectContaining({ code: "INVALID_CATEGORY_ORDER", status: 409 }),
    );

    const sorted = service.reorder("user-a", ["custom-a", "system-a"]);
    expect(sorted.map((item) => item.id)).toEqual(["custom-a", "system-a"]);
    expect(service.list("user-b").map((item) => item.id)).toEqual(["system-b"]);
  });

  it("blocks deletion while an owned transaction references the category", () => {
    database.db
      .insert(transactions)
      .values({
        id: "transaction-a",
        userId: "user-a",
        type: "expense",
        amountMinor: 1_000,
        currency: "CNY",
        categoryId: "custom-a",
        transactionTime: now,
        createdAt: now,
        updatedAt: now,
        source: "manual",
        fingerprint: "fingerprint-a",
      })
      .run();

    expect(() => service.remove("user-a", "custom-a")).toThrowError(
      expect.objectContaining({ code: "CATEGORY_IN_USE", status: 409 }),
    );
    expect(
      service.list("user-a").find((item) => item.id === "custom-a"),
    ).toMatchObject({ transactionCount: 1, ruleCount: 0 });
    expect(database.db.select().from(categories).where(eq(categories.id, "custom-a")).get()).toBeTruthy();
    expect(() =>
      service.update(
        "user-a",
        "custom-a",
        categoryUpdateSchema.parse({ kind: "income" }),
      ),
    ).toThrowError(
      expect.objectContaining({ code: "CATEGORY_KIND_IN_USE", status: 409 }),
    );
  });

  it("does not treat a voided Transaction as active category usage", () => {
    database.db
      .insert(transactions)
      .values({
        id: "voided-transaction-a",
        userId: "user-a",
        type: "expense",
        amountMinor: 1_000,
        currency: "CNY",
        categoryId: "custom-a",
        transactionTime: now,
        createdAt: now,
        updatedAt: now,
        source: "manual",
        fingerprint: "voided-fingerprint-a",
        voidedAt: now,
      })
      .run();

    expect(
      service.list("user-a").find((item) => item.id === "custom-a"),
    ).toMatchObject({ transactionCount: 0 });
    expect(service.remove("user-a", "custom-a")).toEqual({
      id: "custom-a",
      removedRuleCount: 0,
    });
  });

  it("lists and deletes merchant rules without crossing user boundaries", () => {
    database.db
      .insert(merchantCategoryRules)
      .values([
        {
          id: "rule-a",
          userId: "user-a",
          categoryId: "custom-a",
          normalizedMerchantName: "corner pet store",
          matchType: "exact",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "rule-b",
          userId: "user-b",
          categoryId: "system-b",
          normalizedMerchantName: "another user’s merchant",
          matchType: "exact",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();

    expect(service.listMerchantRules("user-a")).toEqual([
      expect.objectContaining({ id: "rule-a", categoryName: "Pets" }),
    ]);
    expect(
      service.list("user-a").find((item) => item.id === "custom-a"),
    ).toMatchObject({ transactionCount: 0, ruleCount: 1 });
    expect(() => service.removeMerchantRule("user-a", "rule-b")).toThrowError(
      expect.objectContaining({ code: "MERCHANT_RULE_NOT_FOUND", status: 404 }),
    );
    expect(service.removeMerchantRule("user-a", "rule-a")).toEqual({ id: "rule-a" });
    expect(service.listMerchantRules("user-a")).toHaveLength(0);
    expect(database.db.select().from(merchantCategoryRules).where(eq(merchantCategoryRules.id, "rule-b")).get()).toBeTruthy();
  });

  it("deletes an unused custom category and reports cascading rule removal", () => {
    database.db
      .insert(merchantCategoryRules)
      .values({
        id: "rule-a",
        userId: "user-a",
        categoryId: "custom-a",
        normalizedMerchantName: "corner pet store",
        matchType: "exact",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    expect(service.remove("user-a", "custom-a")).toEqual({
      id: "custom-a",
      removedRuleCount: 1,
    });
    expect(database.db.select().from(merchantCategoryRules).where(eq(merchantCategoryRules.id, "rule-a")).get()).toBeUndefined();
  });
});

describe("built-in category names", () => {
  let database: ReturnType<typeof createDatabase>;
  let service: ReturnType<typeof createCategoryManagementService>;

  function names(userId: string) {
    return Object.fromEntries(
      service.list(userId).map((category) => [category.id, category.name]),
    );
  }

  beforeEach(() => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    database.db
      .insert(users)
      .values(
        ["owner", "neighbor"].map((id) => ({
          id,
          email: `${id}@example.com`,
          passwordHash: "test",
          displayName: id,
          timezone: "Asia/Shanghai",
          createdAt: now,
          updatedAt: now,
        })),
      )
      .run();
    database.db.insert(categories).values([
      ...defaultCategoryRows("owner", "en", now),
      ...defaultCategoryRows("neighbor", "en", now),
    ]).run();
    service = createCategoryManagementService(database.db);
  });

  afterEach(() => database.sqlite.close());

  it("renames untouched built-ins to the UI language and skips taken names", () => {
    database.db.insert(categories).values([
      // A custom category already owns the Chinese name of "Food".
      { id: "custom-food", userId: "owner", name: "餐饮", kind: "expense", isSystem: false, sortOrder: 20, createdAt: now, updatedAt: now },
      { id: "custom-coffee", userId: "owner", name: "Coffee", kind: "expense", isSystem: false, sortOrder: 21, createdAt: now, updatedAt: now },
    ]).run();
    database.db.update(categories).set({ name: "Transport (built-in 2)" })
      .where(eq(categories.id, "owner:category:transport")).run();

    expect(service.builtInNameStatus("owner", "zh")).toEqual({ locale: "zh", renamable: 12, conflicting: 1 });
    expect(service.builtInNameStatus("owner", "en")).toEqual({ locale: "en", renamable: 0, conflicting: 0 });

    const result = service.applyBuiltInNames("owner", "zh");

    expect(result).toMatchObject({ renamed: 12, skipped: 1 });
    expect(names("owner")).toMatchObject({
      "owner:category:other": "其他",
      "owner:category:redpacket": "红包",
      "owner:category:food": "Food",
      "owner:category:transport": "Transport (built-in 2)",
      "custom-food": "餐饮",
      "custom-coffee": "Coffee",
    });
    expect(result.categories.find((category) => category.id === "owner:category:other"))
      .toMatchObject({ name: "其他", builtInKey: "other" });
    expect(names("neighbor")["neighbor:category:other"]).toBe("Other");
    expect(service.builtInNameStatus("owner", "zh")).toEqual({ locale: "zh", renamable: 0, conflicting: 1 });
  });

  it("switches back to English and keeps merchant rules on the renamed category", () => {
    database.db.insert(merchantCategoryRules).values({
      id: "rule", userId: "owner", categoryId: "owner:category:food",
      normalizedMerchantName: "mountain cafe", matchType: "exact", createdAt: now, updatedAt: now,
    }).run();
    service.applyBuiltInNames("owner", "zh");

    const result = service.applyBuiltInNames("owner", "en");

    expect(result).toMatchObject({ renamed: 14, skipped: 0 });
    expect(result.rules).toEqual([
      expect.objectContaining({ id: "rule", categoryId: "owner:category:food", categoryName: "Food" }),
    ]);
    expect(service.applyBuiltInNames("owner", "en")).toMatchObject({ renamed: 0, skipped: 0 });
  });

  it("treats a case-insensitive match with another category as taken", () => {
    database.db.insert(categories).values({
      id: "custom-other", userId: "owner", name: "other", kind: "both",
      isSystem: false, sortOrder: 20, createdAt: now, updatedAt: now,
    }).run();
    service.applyBuiltInNames("owner", "zh");

    expect(service.applyBuiltInNames("owner", "en")).toMatchObject({ renamed: 13, skipped: 1 });
    expect(names("owner")["owner:category:other"]).toBe("其他");
  });

  it("validates the requested language", () => {
    expect(builtInNamesInputSchema.safeParse({ locale: "zh" }).success).toBe(true);
    expect(builtInNamesInputSchema.safeParse({ locale: "fr" }).success).toBe(false);
    expect(builtInNamesInputSchema.safeParse({ locale: "zh", extra: 1 }).success).toBe(false);
  });
});

describe("account settings service", () => {
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    database.db
      .insert(users)
      .values([
        {
          id: "user-a",
          email: "file-a@example.com",
          passwordHash: "test",
          displayName: "A",
          timezone: "Asia/Shanghai",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "user-b",
          email: "file-b@example.com",
          passwordHash: "test",
          displayName: "B",
          timezone: "Asia/Shanghai",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    database.db
      .insert(storedFiles)
      .values([
        {
          id: "file-a",
          userId: "user-a",
          kind: "bill",
          originalName: "My transaction.csv",
          storageKey: "secret/user-a/file.csv",
          mimeType: "text/csv",
          extension: "csv",
          size: 120,
          sha256: "a".repeat(64),
          createdAt: now,
        },
        {
          id: "file-b",
          userId: "user-b",
          kind: "screenshot",
          originalName: "Another user’s screenshot.png",
          storageKey: "secret/user-b/file.png",
          mimeType: "image/png",
          extension: "png",
          size: 240,
          sha256: "b".repeat(64),
          createdAt: now,
        },
      ])
      .run();
    database.db
      .insert(transactions)
      .values({
        id: "file-transaction-a",
        userId: "user-a",
        type: "expense",
        amountMinor: 1_000,
        currency: "CNY",
        transactionTime: now,
        createdAt: now,
        updatedAt: now,
        source: "manual",
        originalFileId: "file-a",
        fingerprint: "file-fingerprint-a",
      })
      .run();
    database.db
      .insert(importBatches)
      .values({
        id: "batch-a",
        userId: "user-a",
        fileId: "file-a",
        source: "other",
        status: "completed",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(recognitionJobs)
      .values({
        id: "job-a",
        userId: "user-a",
        status: "completed",
        providerId: "mock",
        totalCount: 1,
        succeededCount: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(recognitionItems)
      .values({
        id: "recognition-item-a",
        userId: "user-a",
        jobId: "job-a",
        fileId: "file-a",
        position: 1,
        status: "recognized",
        validationErrors: [],
        warnings: [],
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => database.sqlite.close());

  it("normalizes and updates only the current user's display name", () => {
    const service = createAccountSettingsService(database.db, {
      delete: vi.fn(async () => true),
    });

    expect(
      service.updateProfile(
        "user-a",
        profileSettingsInputSchema.parse({ displayName: "  New nickname  " }),
      ),
    ).toEqual({ displayName: "New nickname", avatarPreset: "piggy" });
    expect(
      database.db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, "user-a"))
        .get(),
    ).toEqual({ displayName: "New nickname" });
    expect(
      database.db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, "user-b"))
        .get(),
    ).toEqual({ displayName: "B" });

    expect(
      service.updateProfile(
        "user-a",
        profileSettingsInputSchema.parse({ avatarPreset: "cat" }),
      ),
    ).toEqual({ displayName: "New nickname", avatarPreset: "cat" });
    expect(
      database.db
        .select({ avatarPreset: users.avatarPreset })
        .from(users)
        .where(eq(users.id, "user-b"))
        .get(),
    ).toEqual({ avatarPreset: "piggy" });
  });

  it("validates display names and rejects an unknown account", () => {
    expect(
      profileSettingsInputSchema.safeParse({ displayName: "   " }).success,
    ).toBe(false);
    expect(
      profileSettingsInputSchema.safeParse({ displayName: "a".repeat(41) })
        .success,
    ).toBe(false);
    expect(profileSettingsInputSchema.safeParse({}).success).toBe(false);
    expect(
      profileSettingsInputSchema.safeParse({ avatarPreset: "unknown" }).success,
    ).toBe(false);
    expect(
      profileSettingsInputSchema.safeParse({
        displayName: "Valid nickname",
        unexpected: true,
      }).success,
    ).toBe(false);

    const service = createAccountSettingsService(database.db, {
      delete: vi.fn(async () => true),
    });
    expect(() =>
      service.updateProfile("missing-user", { displayName: "New nickname" }),
    ).toThrowError(expect.objectContaining({ code: "USER_NOT_FOUND" }));
  });

  it("lists only owned active files without exposing storage keys", () => {
    const remove = vi.fn(async () => true);
    const service = createAccountSettingsService(database.db, { delete: remove });
    const result = service.listFiles("user-a");
    const files = result.items;

    expect(files).toEqual([
      expect.objectContaining({
        id: "file-a",
        originalName: "My transaction.csv",
        transactionCount: 1,
        importBatchCount: 1,
        recognitionItemCount: 1,
      }),
    ]);
    expect(files[0]).not.toHaveProperty("storageKey");
    expect(files[0]).not.toHaveProperty("sha256");
    expect(result.pagination).toMatchObject({ page: 1, total: 1, totalPages: 1 });
  });

  it("paginates every active owned file so older files remain manageable", () => {
    database.db
      .insert(storedFiles)
      .values(
        Array.from({ length: 21 }, (_, index) => ({
          id: `extra-file-${index}`,
          userId: "user-a",
          kind: "bill" as const,
          originalName: `Historical transaction-${index}.csv`,
          storageKey: `secret/user-a/extra-${index}.csv`,
          mimeType: "text/csv",
          extension: "csv",
          size: 10,
          sha256: String(index).padStart(64, "0"),
          createdAt: new Date(Date.parse(now) - index * 1_000).toISOString(),
        })),
      )
      .run();
    const service = createAccountSettingsService(database.db, {
      delete: vi.fn(async () => true),
    });

    const secondPage = service.listFiles("user-a", { page: 2, limit: 20 });
    expect(secondPage.pagination).toMatchObject({
      page: 2,
      total: 22,
      totalPages: 2,
    });
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.items.every((file) => file.id !== "file-b")).toBe(true);
  });

  it("rejects cross-user file deletion before invoking storage", async () => {
    const remove = vi.fn(async () => true);
    const service = createAccountSettingsService(database.db, { delete: remove });

    await expect(service.removeFile("user-a", "file-b")).rejects.toMatchObject({
      code: "FILE_NOT_FOUND",
      status: 404,
    });
    expect(remove).not.toHaveBeenCalled();

    await expect(service.removeFile("user-a", "file-a")).resolves.toMatchObject({
      id: "file-a",
      referencePolicy: expect.stringContaining("Existing transactions and import records remain"),
    });
    expect(remove).toHaveBeenCalledWith("user-a", "file-a");
  });

  it("discloses third-party mode without exposing endpoint or API key", () => {
    const metadata = getRecognitionProviderMetadata({
      RECEIPT_RECOGNITION_PROVIDER: "http",
      RECEIPT_RECOGNITION_HTTP_ENDPOINT: "https://recognition.example.test/v1",
      RECEIPT_RECOGNITION_HTTP_API_KEY: "super-secret-key",
      NODE_ENV: "production",
    });
    const serialized = JSON.stringify(metadata);

    expect(metadata).toMatchObject({
      mode: "third-party",
      configured: true,
      sendsImagesToThirdParty: true,
    });
    expect(serialized).not.toContain("recognition.example.test");
    expect(serialized).not.toContain("super-secret-key");
  });
});
