import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { categories, transactions, users } from "@/db/schema";
import {
  AccountInitializationError,
  initializeAccount,
} from "@/services/account-initialization-service";

describe("account initialization service", () => {
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
  });

  afterEach(() => database.sqlite.close());

  it("creates one user and default categories without sample transactions", async () => {
    const result = await initializeAccount(database.db, {
      email: "Owner@Example.com",
      password: "a-secure-initial-password",
    });

    expect(result.email).toBe("owner@example.com");
    expect(database.db.select().from(users).all()).toMatchObject([
      { email: "owner@example.com", role: "admin", disabledAt: null },
    ]);
    expect(database.db.select().from(categories).all()).toHaveLength(14);
    expect(database.db.select().from(categories).all().map((category) => category.name))
      .toContain("Other");
    expect(database.db.select().from(transactions).all()).toHaveLength(0);
  });

  it("names the built-in categories in the requester's language", async () => {
    const { id } = await initializeAccount(database.db, {
      email: "owner@example.com",
      password: "a-secure-initial-password",
      locale: "zh",
    });

    const seeded = database.db.select().from(categories).all();
    expect(seeded.find((category) => category.id === `${id}:category:food`)).toMatchObject({
      name: "餐饮",
      isSystem: true,
    });
    expect(seeded.find((category) => category.id === `${id}:category:other`)?.name).toBe("其他");
    expect(seeded.every((category) => /\p{Script=Han}/u.test(category.name))).toBe(true);
  });

  it("refuses to overwrite an existing account", async () => {
    await initializeAccount(database.db, {
      email: "owner@example.com",
      password: "a-secure-initial-password",
    });

    await expect(
      initializeAccount(database.db, {
        email: "other@example.com",
        password: "another-secure-password",
      }),
    ).rejects.toMatchObject({
      code: "USER_ALREADY_EXISTS",
    } satisfies Partial<AccountInitializationError>);
  });
});
