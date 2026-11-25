import { createHash } from "node:crypto";

import { AiCategorizationError } from "@/services/ai-categorization-service/error";
import { OpenAiCompatibleCategorizationProvider } from "@/services/ai-categorization-service/openai-compatible-provider";
import type {
  AiCategorizationProvider,
  AiCategorizationRuntime,
} from "@/services/ai-categorization-service/types";

export interface AiCategorizationEnvironment {
  [key: string]: string | undefined;
  AI_CATEGORIZATION_PROVIDER?: string;
  AI_CATEGORIZATION_BASE_URL?: string;
  AI_CATEGORIZATION_MODEL?: string;
  AI_CATEGORIZATION_API_KEY?: string;
  AI_CATEGORIZATION_RESPONSE_MODE?: string;
  AI_CATEGORIZATION_AUTO_THRESHOLD?: string;
  AI_CATEGORIZATION_BATCH_SIZE?: string;
  AI_CATEGORIZATION_TIMEOUT_MS?: string;
  AI_CATEGORIZATION_ALLOW_INSECURE_HTTP?: string;
}

class DisabledAiCategorizationProvider implements AiCategorizationProvider {
  readonly name = "off" as const;
  readonly model = null;
  readonly enabled = false;
  readonly sendsDataToThirdParty = false;

  async classifyBatch() {
    return [];
  }
}

function configurationFingerprint(value: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizedFingerprintBaseUrl(value: string) {
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/$/u, "");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.trim();
  }
}

function parseBoolean(value: string | undefined, key: string) {
  if (value === undefined || value.trim() === "") return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new AiCategorizationError(
    "PROVIDER_CONFIGURATION_ERROR",
    `${key} must be true or false`,
    500,
  );
}

function parseInteger(
  value: string | undefined,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new AiCategorizationError(
      "PROVIDER_CONFIGURATION_ERROR",
      `${key} must be ${minimum} to ${maximum} within the integer range`,
      500,
    );
  }
  return parsed;
}

function parseThreshold(value: string | undefined) {
  if (value === undefined || value.trim() === "") return 0.85;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new AiCategorizationError(
      "PROVIDER_CONFIGURATION_ERROR",
      "AI_CATEGORIZATION_AUTO_THRESHOLD must be 0 to 1 within the numeric range",
      500,
    );
  }
  return parsed;
}

function requiredSetting(
  env: AiCategorizationEnvironment,
  key: "AI_CATEGORIZATION_BASE_URL" | "AI_CATEGORIZATION_MODEL",
) {
  const value = env[key]?.trim();
  if (!value) {
    throw new AiCategorizationError(
      "PROVIDER_CONFIGURATION_ERROR",
      `OpenAI compatible categorization requires ${key}`,
      500,
    );
  }
  return value;
}

export function createAiCategorizationRuntime(options: {
  env?: AiCategorizationEnvironment;
  fetch?: typeof fetch;
} = {}): AiCategorizationRuntime {
  const env = options.env ?? process.env;
  const mode = env.AI_CATEGORIZATION_PROVIDER?.trim().toLowerCase() || "off";
  const autoThreshold = parseThreshold(env.AI_CATEGORIZATION_AUTO_THRESHOLD);
  const batchSize = parseInteger(
    env.AI_CATEGORIZATION_BATCH_SIZE,
    "AI_CATEGORIZATION_BATCH_SIZE",
    20,
    1,
    50,
  );

  if (mode === "off") {
    return {
      provider: new DisabledAiCategorizationProvider(),
      autoThreshold,
      batchSize,
      configurationFingerprint: configurationFingerprint({
        mode: "off",
        autoThreshold,
      }),
      metadata: {
        mode: "off",
        providerLabel: "AI categorization is disabled",
        configured: true,
        enabled: false,
        sendsDataToThirdParty: false,
        model: null,
        disclosure: "Only merchant learning rules and local keywords are used. No transaction text is sent.",
        retentionPolicy: "No calls to AI services; no server-side copies are created.",
      },
    };
  }
  if (mode !== "openai-compatible") {
    throw new AiCategorizationError(
      "PROVIDER_CONFIGURATION_ERROR",
      `Unsupported AI categorization provider: ${mode}`,
      500,
    );
  }

  const responseMode =
    env.AI_CATEGORIZATION_RESPONSE_MODE?.trim() || "json_schema";
  if (responseMode !== "json_schema" && responseMode !== "json_object") {
    throw new AiCategorizationError(
      "PROVIDER_CONFIGURATION_ERROR",
      "AI_CATEGORIZATION_RESPONSE_MODE only supports json_schema or json_object",
      500,
    );
  }
  const baseUrl = requiredSetting(env, "AI_CATEGORIZATION_BASE_URL");
  const model = requiredSetting(env, "AI_CATEGORIZATION_MODEL");
  const provider = new OpenAiCompatibleCategorizationProvider({
    baseUrl,
    model,
    apiKey: env.AI_CATEGORIZATION_API_KEY,
    responseMode,
    timeoutMs: parseInteger(
      env.AI_CATEGORIZATION_TIMEOUT_MS,
      "AI_CATEGORIZATION_TIMEOUT_MS",
      30_000,
      100,
      120_000,
    ),
    allowInsecureHttp: parseBoolean(
      env.AI_CATEGORIZATION_ALLOW_INSECURE_HTTP,
      "AI_CATEGORIZATION_ALLOW_INSECURE_HTTP",
    ),
    fetch: options.fetch,
  });

  return {
    provider,
    autoThreshold,
    batchSize,
    configurationFingerprint: configurationFingerprint({
      mode,
      baseUrl: normalizedFingerprintBaseUrl(baseUrl),
      model,
      responseMode,
      autoThreshold,
    }),
    metadata: {
      mode: provider.sendsDataToThirdParty ? "third-party" : "local",
      providerLabel: provider.sendsDataToThirdParty
        ? "OpenAI compatible external categorization service"
        : "Local OpenAI compatible categorization service",
      configured: true,
      enabled: true,
      sendsDataToThirdParty: provider.sendsDataToThirdParty,
      model: provider.model,
      disclosure: provider.sendsDataToThirdParty
        ? "Categorization sends transaction type, source, merchant, cleaned description, and category names. Order IDs, user identifiers, and original files are excluded. When a phone has item recognition switched on, the text of the order pages shown before a shopping-app payment is sent too, after phone numbers, address lines, links and long numbers are removed."
        : "Categorization data is sent only to a local loopback address and never leaves this device.",
      retentionPolicy: provider.sendsDataToThirdParty
        ? "Provider retention and duration depend on the agreement between the deployer and provider."
        : "The app does not retain complete prompts or raw model responses.",
    },
  };
}

export function createSafeAiCategorizationRuntime(options: {
  env?: AiCategorizationEnvironment;
  fetch?: typeof fetch;
} = {}): AiCategorizationRuntime {
  try {
    return createAiCategorizationRuntime(options);
  } catch {
    return {
      provider: new DisabledAiCategorizationProvider(),
      autoThreshold: 0.85,
      batchSize: 20,
      configurationFingerprint: configurationFingerprint({
        mode: "unavailable",
      }),
      metadata: {
        mode: "unavailable",
        providerLabel: "AI categorization configuration is unavailable",
        configured: false,
        enabled: false,
        sendsDataToThirdParty: false,
        model: null,
        disclosure: "No transaction text is sent. Categorization falls back to local rules.",
        retentionPolicy: "No calls to AI services; no server-side copies are created.",
      },
    };
  }
}
