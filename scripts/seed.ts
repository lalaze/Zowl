import "dotenv/config";

import { eq } from "drizzle-orm";

import { hashPassword } from "../src/lib/password";
import { defaultAvatarPreset } from "../src/lib/avatar-presets";
import { defaultCategories } from "../src/lib/default-categories";
import { database } from "../src/db/client";
import { categories, transactions, users } from "../src/db/schema";
import { createLedgerTransactionService } from "../src/services/ledger-transaction";

const DEMO_USER_ID = "demo-user";
const now = new Date();
const timestamp = now.toISOString();

const transactionSeeds = [
  {
    id: "demo-transaction-1",
    type: "expense" as const,
    amountMinor: 3580,
    merchantName: "Mountain Cafe",
    description: "Latte and bagel",
    categoryId: "category-food",
    paymentMethod: "Alipay balance",
    daysAgo: 0,
  },
  {
    id: "demo-transaction-2",
    type: "expense" as const,
    amountMinor: 620,
    merchantName: "Shanghai Metro",
    description: "Commute",
    categoryId: "category-transport",
    paymentMethod: "WeChat Pay",
    daysAgo: 1,
  },
  {
    id: "demo-transaction-3",
    type: "expense" as const,
    amountMinor: 4890,
    merchantName: "Greenfield Bistro",
    description: "Dinner",
    categoryId: "category-food",
    paymentMethod: "CMB debit card",
    daysAgo: 2,
  },
  {
    id: "demo-transaction-4",
    type: "income" as const,
    amountMinor: 1850000,
    merchantName: "Galaxy Technology",
    description: "Monthly salary",
    categoryId: "category-salary",
    paymentMethod: "Bank transfer",
    daysAgo: 4,
  },
  {
    id: "demo-transaction-5",
    type: "expense" as const,
    amountMinor: 12900,
    merchantName: "Boundless Books",
    description: "Two design books",
    categoryId: "category-education",
    paymentMethod: "Alipay Huabei",
    daysAgo: 5,
  },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("db:seed Demo data can only be created outside production");
  }

  const email = (process.env.DEMO_EMAIL ?? "demo@zemoney.local").toLowerCase();
  const password = process.env.DEMO_PASSWORD ?? "zemoney-demo";
  const passwordHash = await hashPassword(password);

  database.db
    .insert(users)
    .values({
      id: DEMO_USER_ID,
      email,
      passwordHash,
      displayName: "Ze",
      role: "admin",
      disabledAt: null,
      avatarPreset: defaultAvatarPreset,
      timezone: "Asia/Shanghai",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email,
        passwordHash,
        disabledAt: null,
        updatedAt: timestamp,
      },
    })
    .run();

  defaultCategories.forEach((category, sortOrder) => {
    database.db
      .insert(categories)
      .values({
        id: `category-${category.key}`,
        userId: DEMO_USER_ID,
        name: category.names.en,
        kind: category.kind,
        icon: category.icon,
        color: category.color,
        isSystem: true,
        sortOrder,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      // Seeding is safe to repeat: preserve user-adjusted icon, color and order.
      .onConflictDoNothing({ target: categories.id })
      .run();
  });

  const hasTransactionHistory = Boolean(
    database.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.userId, DEMO_USER_ID))
      .limit(1)
      .get(),
  );
  if (!hasTransactionHistory) {
    const ledger = createLedgerTransactionService(database.db);
    transactionSeeds.forEach((item) => {
      const transactionTime = new Date(
        now.getTime() - item.daysAgo * 24 * 60 * 60 * 1000,
      ).toISOString();
      const result = ledger.confirmPosting(DEMO_USER_ID, {
        identity: { id: `seed:${item.id}`, version: 1 },
        items: [
          {
            sourceItemRef: `seed:${item.id}`,
            decision: "post",
            candidate: {
              facts: {
                type: item.type,
                amountMinor: item.amountMinor,
                currency: "CNY",
                merchantName: item.merchantName,
                description: item.description,
                categoryId: item.categoryId,
                transactionTime,
                paymentMethod: item.paymentMethod,
              },
              provenance: { kind: "manual" },
            },
          },
        ],
      });
      if (result.status !== "completed") {
        throw new Error(`Seed confirmation ${item.id} requires review`);
      }
    });
  }

  database.sqlite.close();
  console.log(`Demo seed complete for ${email}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Seed failed");
  process.exitCode = 1;
});
