import path from "node:path";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDatabase } from "@/db/client";
import { aiCategorizationSettings, users } from "@/db/schema";
import {
  createAiCategorizationSettingsService,
  type AiCategorizationSettingsInput,
} from "@/services/ai-categorization-service";

const encryptionKey = Buffer.alloc(32, 7).toString("base64");

function input(
  change: Partial<AiCategorizationSettingsInput> = {},
): AiCategorizationSettingsInput {
  return {
    enabled: true,
    baseUrl: "https://api.example.test/v1",
    model: "category-model-v1",
    responseMode: "json_schema",
    autoThreshold: 0.85,
    batchSize: 20,
    timeoutMs: 30_000,
    allowInsecureHttp: false,
    apiKeyAction: { action: "replace", value: "private-api-key" },
    ...change,
  };
}

describe("AI categorization settings service", () => {
  let database: ReturnType<typeof createDatabase>;

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
          email: "settings-a@example.com",
          passwordHash: "test",
          displayName: "A",
          timezone: "Asia/Shanghai",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "user-b",
          email: "settings-b@example.com",
          passwordHash: "test",
          displayName: "B",
          timezone: "Asia/Shanghai",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
  });

  afterEach(() => database.sqlite.close());

  it("encrypts API keys, redacts responses, and isolates settings by user", () => {
    const service = createAiCategorizationSettingsService(database.db, {
      env: { AI_CATEGORIZATION_ENCRYPTION_KEY: encryptionKey },
    });

    const state = service.save("user-a", input());
    const stored = database.db
      .select()
      .from(aiCategorizationSettings)
      .where(eq(aiCategorizationSettings.userId, "user-a"))
      .get()!;

    expect(stored.encryptedApiKey).toBeTruthy();
    expect(stored.encryptedApiKey).not.toContain("private-api-key");
    expect(JSON.stringify(state)).not.toContain("private-api-key");
    expect(state).toMatchObject({
      source: "user",
      userConfig: { apiKeyConfigured: true, model: "category-model-v1" },
    });
    expect(service.resolveRuntime("user-a").provider.model).toBe(
      "category-model-v1",
    );
    expect(service.getState("user-b")).toMatchObject({
      source: "environment",
      userConfig: null,
    });
  });

  it("applies updates immediately and supports keeping or removing a key", () => {
    const service = createAiCategorizationSettingsService(database.db, {
      env: { AI_CATEGORIZATION_ENCRYPTION_KEY: encryptionKey },
    });
    service.save(
      "user-a",
      input({
        baseUrl: "http://192.168.1.20:11434/v1",
        allowInsecureHttp: true,
      }),
    );
    service.save(
      "user-a",
      input({
        baseUrl: "http://192.168.1.20:11434/v1",
        model: "category-model-v2",
        allowInsecureHttp: true,
        apiKeyAction: { action: "keep" },
      }),
    );
    expect(service.resolveRuntime("user-a").provider.model).toBe(
      "category-model-v2",
    );
    expect(service.getState("user-a").userConfig?.apiKeyConfigured).toBe(true);

    service.save(
      "user-a",
      input({
        baseUrl: "http://192.168.1.20:11434/v1",
        allowInsecureHttp: true,
        apiKeyAction: { action: "remove" },
      }),
    );
    expect(service.getState("user-a").userConfig?.apiKeyConfigured).toBe(false);
    expect(service.resolveRuntime("user-a").provider.enabled).toBe(true);
  });

  it("lets an explicit user disable override the environment and reset restores it", () => {
    const service = createAiCategorizationSettingsService(database.db, {
      env: {
        AI_CATEGORIZATION_PROVIDER: "openai-compatible",
        AI_CATEGORIZATION_BASE_URL: "https://api.example.test/v1",
        AI_CATEGORIZATION_MODEL: "environment-model",
        AI_CATEGORIZATION_API_KEY: "environment-key",
      },
    });
    expect(service.resolveRuntime("user-a").provider.model).toBe(
      "environment-model",
    );

    service.save(
      "user-a",
      input({
        enabled: false,
        baseUrl: null,
        model: null,
        apiKeyAction: { action: "keep" },
      }),
    );
    expect(service.resolveRuntime("user-a").provider.enabled).toBe(false);
    expect(service.getState("user-a").source).toBe("user");

    service.reset("user-a");
    expect(service.resolveRuntime("user-a").provider.model).toBe(
      "environment-model",
    );
  });

  it("does not fall back to environment configuration when a stored key cannot decrypt", () => {
    createAiCategorizationSettingsService(database.db, {
      env: { AI_CATEGORIZATION_ENCRYPTION_KEY: encryptionKey },
    }).save("user-a", input());
    const service = createAiCategorizationSettingsService(database.db, {
      env: {
        AI_CATEGORIZATION_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString(
          "base64",
        ),
        AI_CATEGORIZATION_PROVIDER: "openai-compatible",
        AI_CATEGORIZATION_BASE_URL: "https://fallback.example.test/v1",
        AI_CATEGORIZATION_MODEL: "must-not-be-used",
        AI_CATEGORIZATION_API_KEY: "fallback-key",
      },
    });

    expect(service.getState("user-a")).toMatchObject({
      source: "user",
      effectiveMetadata: { mode: "unavailable", enabled: false },
      configurationError: { code: "AI_SETTINGS_SECRET_DECRYPTION_FAILED" },
    });
    expect(service.resolveRuntime("user-a").provider.enabled).toBe(false);
  });

  it("requires encryption for persisted secrets but permits keyless private services", () => {
    const service = createAiCategorizationSettingsService(database.db, {
      env: {},
    });
    expect(() => service.save("user-a", input())).toThrowError(
      /AI_CATEGORIZATION_ENCRYPTION_KEY/u,
    );

    expect(() =>
      service.save(
        "user-a",
        input({
          baseUrl: "http://10.0.0.5:11434/v1",
          allowInsecureHttp: true,
          apiKeyAction: { action: "remove" },
        }),
      ),
    ).not.toThrow();
    expect(service.resolveRuntime("user-a").provider.enabled).toBe(true);
  });

  it("tests with synthetic data without persisting the candidate", async () => {
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const prompt = JSON.parse(body.messages[1].content);
      expect(prompt.transactions).toEqual([
        expect.objectContaining({
          merchantName: "Test Cafe",
          description: "Latte",
        }),
      ]);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  results: [
                    {
                      itemRef: "connection-test",
                      categoryId: "test-food",
                      confidence: 0.99,
                      ambiguous: false,
                      reason: "Test successful",
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    });
    const service = createAiCategorizationSettingsService(database.db, {
      env: { AI_CATEGORIZATION_ENCRYPTION_KEY: encryptionKey },
      fetch: request as unknown as typeof fetch,
    });

    await expect(
      service.testConnection("user-a", {
        source: "candidate",
        config: input(),
      }),
    ).resolves.toMatchObject({ ok: true, model: "category-model-v1" });
    expect(request).toHaveBeenCalledOnce();
    expect(service.getState("user-a").userConfig).toBeNull();
  });
});
