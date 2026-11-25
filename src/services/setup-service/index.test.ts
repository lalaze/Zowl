import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { categories, users } from "@/db/schema";
import {
  createSetupService,
  SetupServiceError,
} from "@/services/setup-service";

const setupToken = "a".repeat(32);
const setupInput = {
  setupToken,
  email: "owner@example.com",
  displayName: "Ledger administrator",
  password: "a-secure-admin-password",
};

describe("setup service", () => {
  let database: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
  });

  afterEach(() => database.sqlite.close());

  it("creates the sole administrator and default categories", async () => {
    const service = createSetupService(database.db, {
      setupTokenLoader: async () => setupToken,
    });

    await expect(service.initializeAdmin(setupInput)).resolves.toMatchObject({
      email: "owner@example.com",
    });
    expect(service.isInitialized()).toBe(true);
    expect(database.db.select().from(users).get()).toMatchObject({
      email: "owner@example.com",
      displayName: "Ledger administrator",
      role: "admin",
      disabledAt: null,
    });
    expect(database.db.select().from(categories).all()).toHaveLength(14);
  });

  it("rejects a wrong setup token without creating an account", async () => {
    const service = createSetupService(database.db, {
      setupTokenLoader: async () => setupToken,
    });

    await expect(
      service.initializeAdmin({ ...setupInput, setupToken: "wrong" }),
    ).rejects.toMatchObject({
      status: 403,
      code: "INVALID_SETUP_TOKEN",
    } satisfies Partial<SetupServiceError>);
    expect(service.isInitialized()).toBe(false);
  });

  it("allows only one winner when initialization requests race", async () => {
    const service = createSetupService(database.db, {
      setupTokenLoader: async () => setupToken,
    });

    const results = await Promise.allSettled([
      service.initializeAdmin(setupInput),
      service.initializeAdmin({
        ...setupInput,
        email: "other@example.com",
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(
      1,
    );
    expect(database.db.select().from(users).all()).toHaveLength(1);
  });
});
