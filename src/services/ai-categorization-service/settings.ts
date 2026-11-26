import { eq } from "drizzle-orm";
import { z } from "zod";

import { db, type Database } from "@/db/client";
import { aiCategorizationSettings } from "@/db/schema";
import { defaultLocale, type Locale } from "@/lib/i18n/locale";
import {
  decodeEncryptionKey,
  decryptApiKey,
  encryptApiKey,
} from "@/services/ai-categorization-service/api-key-crypto";
import { AiCategorizationError } from "@/services/ai-categorization-service/error";
import {
  createAiCategorizationRuntime,
  createSafeAiCategorizationRuntime,
  type AiCategorizationEnvironment,
} from "@/services/ai-categorization-service/factory";
import type {
  AiCategorizationProviderMetadata,
  AiCategorizationRuntime,
} from "@/services/ai-categorization-service/types";

const apiKeyActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("keep") }).strict(),
  z
    .object({
      action: z.literal("replace"),
      value: z.string().trim().min(1).max(4_096),
    })
    .strict(),
  z.object({ action: z.literal("remove") }).strict(),
]);

export const aiCategorizationSettingsInputSchema = z
  .object({
    enabled: z.boolean(),
    baseUrl: z.string().trim().max(2_048).nullable(),
    model: z.string().trim().max(160).nullable(),
    responseMode: z.enum(["json_schema", "json_object"]),
    autoThreshold: z.number().min(0).max(1),
    batchSize: z.number().int().min(1).max(50),
    timeoutMs: z.number().int().min(100).max(120_000),
    allowInsecureHttp: z.boolean(),
    apiKeyAction: apiKeyActionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.enabled) return;
    if (!value.baseUrl) {
      context.addIssue({
        code: "custom",
        path: ["baseUrl"],
        message: "Enter OpenAI compatible service URL",
      });
    }
    if (!value.model) {
      context.addIssue({
        code: "custom",
        path: ["model"],
        message: "Enter a model name",
      });
    }
  });

export const aiCategorizationConnectionTestSchema = z.discriminatedUnion(
  "source",
  [
    z.object({ source: z.literal("effective") }).strict(),
    z
      .object({
        source: z.literal("candidate"),
        config: aiCategorizationSettingsInputSchema,
      })
      .strict(),
  ],
);

export type AiCategorizationSettingsInput = z.infer<
  typeof aiCategorizationSettingsInputSchema
>;
export type AiCategorizationConnectionTestInput = z.infer<
  typeof aiCategorizationConnectionTestSchema
>;

export type AiCategorizationSettingsState = {
  source: "user" | "environment";
  effectiveMetadata: AiCategorizationProviderMetadata;
  configurationError: { code: string; message: string } | null;
  secretStorageAvailable: boolean;
  userConfig: {
    enabled: boolean;
    provider: "openai-compatible";
    baseUrl: string | null;
    model: string | null;
    responseMode: "json_schema" | "json_object";
    autoThreshold: number;
    batchSize: number;
    timeoutMs: number;
    allowInsecureHttp: boolean;
    apiKeyConfigured: boolean;
    updatedAt: string;
  } | null;
};

function rowEnvironment(
  row: typeof aiCategorizationSettings.$inferSelect,
  apiKey?: string,
): AiCategorizationEnvironment {
  return {
    AI_CATEGORIZATION_PROVIDER: row.enabled
      ? "openai-compatible"
      : "off",
    AI_CATEGORIZATION_BASE_URL: row.baseUrl ?? undefined,
    AI_CATEGORIZATION_MODEL: row.model ?? undefined,
    AI_CATEGORIZATION_API_KEY: apiKey,
    AI_CATEGORIZATION_RESPONSE_MODE: row.responseMode,
    AI_CATEGORIZATION_AUTO_THRESHOLD: String(
      row.autoThresholdBasisPoints / 10_000,
    ),
    AI_CATEGORIZATION_BATCH_SIZE: String(row.batchSize),
    AI_CATEGORIZATION_TIMEOUT_MS: String(row.timeoutMs),
    AI_CATEGORIZATION_ALLOW_INSECURE_HTTP: String(row.allowInsecureHttp),
  };
}

function inputEnvironment(
  input: AiCategorizationSettingsInput,
  apiKey?: string,
): AiCategorizationEnvironment {
  return {
    AI_CATEGORIZATION_PROVIDER: input.enabled
      ? "openai-compatible"
      : "off",
    AI_CATEGORIZATION_BASE_URL: input.baseUrl ?? undefined,
    AI_CATEGORIZATION_MODEL: input.model ?? undefined,
    AI_CATEGORIZATION_API_KEY: apiKey,
    AI_CATEGORIZATION_RESPONSE_MODE: input.responseMode,
    AI_CATEGORIZATION_AUTO_THRESHOLD: String(input.autoThreshold),
    AI_CATEGORIZATION_BATCH_SIZE: String(input.batchSize),
    AI_CATEGORIZATION_TIMEOUT_MS: String(input.timeoutMs),
    AI_CATEGORIZATION_ALLOW_INSECURE_HTTP: String(input.allowInsecureHttp),
  };
}

function unavailableRuntime() {
  return createSafeAiCategorizationRuntime({
    env: { AI_CATEGORIZATION_PROVIDER: "invalid-user-configuration" },
  });
}

function asEditableConfigurationError(error: unknown): never {
  if (error instanceof AiCategorizationError) {
    throw new AiCategorizationError(
      "INVALID_AI_CATEGORIZATION_SETTINGS",
      error.message,
      error.status === 503 ? 503 : 422,
      error.providerStatus,
    );
  }
  throw error;
}

export function createAiCategorizationSettingsService(
  database: Database = db,
  options: {
    env?: AiCategorizationEnvironment;
    fetch?: typeof fetch;
  } = {},
) {
  const env = options.env ?? process.env;

  function getRow(userId: string) {
    return database
      .select()
      .from(aiCategorizationSettings)
      .where(eq(aiCategorizationSettings.userId, userId))
      .get();
  }

  function runtimeFromRow(
    userId: string,
    row: typeof aiCategorizationSettings.$inferSelect,
  ): {
    runtime: AiCategorizationRuntime;
    error: { code: string; message: string } | null;
  } {
    try {
      const apiKey =
        row.enabled && row.encryptedApiKey
          ? decryptApiKey(userId, row.encryptedApiKey, env)
          : undefined;
      return {
        runtime: createAiCategorizationRuntime({
          env: rowEnvironment(row, apiKey),
          fetch: options.fetch,
        }),
        error: null,
      };
    } catch (error) {
      return {
        runtime: unavailableRuntime(),
        error: {
          code:
            error instanceof AiCategorizationError
              ? error.code
              : "INVALID_AI_CATEGORIZATION_SETTINGS",
          message:
            error instanceof Error
              ? error.message
              : "Personal AI categorization configuration is unavailable",
        },
      };
    }
  }

  function resolveRuntime(userId: string) {
    const row = getRow(userId);
    if (!row) {
      return createSafeAiCategorizationRuntime({ env, fetch: options.fetch });
    }
    return runtimeFromRow(userId, row).runtime;
  }

  function getState(userId: string): AiCategorizationSettingsState {
    const row = getRow(userId);
    if (!row) {
      return {
        source: "environment",
        effectiveMetadata: createSafeAiCategorizationRuntime({
          env,
          fetch: options.fetch,
        }).metadata,
        configurationError: null,
        secretStorageAvailable: decodeEncryptionKey(env) !== null,
        userConfig: null,
      };
    }

    const resolved = runtimeFromRow(userId, row);
    return {
      source: "user",
      effectiveMetadata: resolved.runtime.metadata,
      configurationError: resolved.error,
      secretStorageAvailable: decodeEncryptionKey(env) !== null,
      userConfig: {
        enabled: row.enabled,
        provider: row.provider,
        baseUrl: row.baseUrl,
        model: row.model,
        responseMode: row.responseMode,
        autoThreshold: row.autoThresholdBasisPoints / 10_000,
        batchSize: row.batchSize,
        timeoutMs: row.timeoutMs,
        allowInsecureHttp: row.allowInsecureHttp,
        apiKeyConfigured: row.encryptedApiKey !== null,
        updatedAt: row.updatedAt,
      },
    };
  }

  function existingApiKey(
    userId: string,
    row: typeof aiCategorizationSettings.$inferSelect | undefined,
  ) {
    return row?.encryptedApiKey
      ? decryptApiKey(userId, row.encryptedApiKey, env)
      : undefined;
  }

  function resolveInputApiKey(
    userId: string,
    input: AiCategorizationSettingsInput,
    row: typeof aiCategorizationSettings.$inferSelect | undefined,
  ) {
    if (input.apiKeyAction.action === "replace") {
      return input.apiKeyAction.value;
    }
    if (input.apiKeyAction.action === "remove") return undefined;
    return existingApiKey(userId, row);
  }

  function validateInputRuntime(
    input: AiCategorizationSettingsInput,
    apiKey?: string,
  ) {
    try {
      return createAiCategorizationRuntime({
        env: inputEnvironment(input, apiKey),
        fetch: options.fetch,
      });
    } catch (error) {
      asEditableConfigurationError(error);
    }
  }

  function save(userId: string, input: AiCategorizationSettingsInput) {
    const existing = getRow(userId);
    let apiKey: string | undefined;
    if (input.enabled) {
      apiKey = resolveInputApiKey(userId, input, existing);
      validateInputRuntime(input, apiKey);
    }

    let encryptedApiKey = existing?.encryptedApiKey ?? null;
    if (input.apiKeyAction.action === "remove") encryptedApiKey = null;
    if (input.apiKeyAction.action === "replace") {
      encryptedApiKey = encryptApiKey(
        userId,
        input.apiKeyAction.value,
        env,
      );
    }

    const now = new Date().toISOString();
    const values = {
      enabled: input.enabled,
      provider: "openai-compatible" as const,
      baseUrl: input.baseUrl || null,
      model: input.model || null,
      encryptedApiKey,
      responseMode: input.responseMode,
      autoThresholdBasisPoints: Math.round(input.autoThreshold * 10_000),
      batchSize: input.batchSize,
      timeoutMs: input.timeoutMs,
      allowInsecureHttp: input.allowInsecureHttp,
      updatedAt: now,
    };
    database
      .insert(aiCategorizationSettings)
      .values({ userId, createdAt: now, ...values })
      .onConflictDoUpdate({
        target: aiCategorizationSettings.userId,
        set: values,
      })
      .run();
    return getState(userId);
  }

  function reset(userId: string) {
    database
      .delete(aiCategorizationSettings)
      .where(eq(aiCategorizationSettings.userId, userId))
      .run();
    return getState(userId);
  }

  /** `locale` exercises the same reason language that real requests will ask for. */
  async function testConnection(
    userId: string,
    input: AiCategorizationConnectionTestInput,
    locale: Locale = defaultLocale,
  ) {
    let runtime: AiCategorizationRuntime;
    if (input.source === "effective") {
      runtime = resolveRuntime(userId);
    } else {
      if (!input.config.enabled) {
        throw new AiCategorizationError(
          "AI_CATEGORIZATION_DISABLED",
          "Enable AI categorization before testing the connection",
          422,
        );
      }
      const apiKey = resolveInputApiKey(
        userId,
        input.config,
        getRow(userId),
      );
      runtime = validateInputRuntime(input.config, apiKey);
    }
    if (!runtime.provider.enabled) {
      throw new AiCategorizationError(
        "AI_CATEGORIZATION_DISABLED",
        "Current AI categorization is disabled",
        422,
      );
    }

    const startedAt = performance.now();
    const [result] = await runtime.provider.classifyBatch({
      categories: [
        { id: "test-food", name: "Food", kind: "expense" },
        { id: "test-other", name: "Other", kind: "both" },
      ],
      items: [
        {
          itemRef: "connection-test",
          type: "expense",
          source: "other",
          merchantName: "Test Cafe",
          description: "Latte",
        },
      ],
      locale,
    });
    return {
      ok: true as const,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      model: runtime.provider.model,
      result: {
        categoryId: result?.categoryId ?? null,
        confidence: result?.confidence ?? 0,
        ambiguous: result?.ambiguous ?? true,
      },
    };
  }

  return { getState, resolveRuntime, save, reset, testConnection };
}

export const aiCategorizationSettingsService =
  createAiCategorizationSettingsService();

export const resolveAiCategorizationRuntime = (userId: string) =>
  aiCategorizationSettingsService.resolveRuntime(userId);
