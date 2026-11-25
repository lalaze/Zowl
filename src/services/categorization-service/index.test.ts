import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { categories, merchantCategoryRules, users } from "@/db/schema";
import { defaultCategoryRows } from "@/lib/default-categories";
import { createCategorizationService } from "@/services/categorization-service";

const now = "2026-07-15T00:00:00.000Z";

describe("categorization service", () => {
  let database: ReturnType<typeof createDatabase>;
  let service: ReturnType<typeof createCategorizationService>;

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
          email: "categorization-a@example.com",
          passwordHash: "test",
          displayName: "A",
          timezone: "Asia/Shanghai",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "user-b",
          email: "categorization-b@example.com",
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
          id: "salary-a",
          userId: "user-a",
          name: "Salary",
          kind: "income",
          isSystem: true,
          sortOrder: 1,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "salary-b",
          userId: "user-b",
          name: "Salary",
          kind: "income",
          isSystem: true,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    database.db
      .insert(merchantCategoryRules)
      .values([
        {
          id: "salary-rule-a",
          userId: "user-a",
          categoryId: "salary-a",
          normalizedMerchantName: "galaxy technology",
          matchType: "exact",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "salary-rule-b",
          userId: "user-b",
          categoryId: "salary-b",
          normalizedMerchantName: "another company",
          matchType: "exact",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    service = createCategorizationService(database.db);
  });

  afterEach(() => database.sqlite.close());

  it("uses an owned merchant rule only when its category kind matches", () => {
    expect(
      service.suggest({
        userId: "user-a",
        type: "income",
        merchantName: "Galaxy Technology",
        description: "July salary",
      }),
    ).toMatchObject({ categoryId: "salary-a", ruleSource: "merchant_rule" });

    expect(
      service.suggest({
        userId: "user-a",
        type: "expense",
        merchantName: "Galaxy Technology",
        description: "Coffee",
      }),
    ).toMatchObject({ categoryId: "food-a", ruleSource: "keyword" });
  });

  it("does not expose or apply another user's merchant rule", () => {
    expect(
      service.suggest({
        userId: "user-a",
        type: "income",
        merchantName: "Another company",
        description: null,
      }),
    ).toMatchObject({ categoryId: null, ruleSource: "none" });
  });

  it("matches keywords and type defaults to built-ins by key, whatever their names", () => {
    database.db.insert(categories).values(
      defaultCategoryRows("user-b", "zh", now).filter((row) =>
        ["food", "refund", "other"].includes(row.id.split(":").pop()!),
      ),
    ).run();

    expect(service.suggest({
      userId: "user-b", type: "expense", merchantName: "Mountain Coffee", description: null,
    })).toMatchObject({ categoryId: "user-b:category:food", categoryName: "餐饮", ruleSource: "keyword" });
    expect(service.suggest({
      userId: "user-b", type: "refund", merchantName: "Shop", description: null,
    })).toMatchObject({ categoryId: "user-b:category:refund", categoryName: "退款", ruleSource: "type_default" });
    expect(service.suggest({
      userId: "user-b", type: "expense", merchantName: "Unknown", description: "支付宝支付通知",
    })).toMatchObject({ categoryId: "user-b:category:other", categoryName: "其他", ruleSource: "type_default" });
  });
});
