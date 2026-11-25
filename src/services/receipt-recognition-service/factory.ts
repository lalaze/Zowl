import {
  HttpJsonReceiptRecognitionProvider,
  type HttpJsonReceiptRecognitionProviderOptions,
} from "@/services/receipt-recognition-service/http-json-provider";
import { ReceiptRecognitionError } from "@/services/receipt-recognition-service/error";
import { MockReceiptRecognitionProvider } from "@/services/receipt-recognition-service/mock-provider";
import type { ReceiptRecognitionProvider } from "@/services/receipt-recognition-service/types";

export interface ReceiptRecognitionEnvironment {
  [key: string]: string | undefined;
  RECEIPT_RECOGNITION_PROVIDER?: string;
  RECEIPT_RECOGNITION_HTTP_ENDPOINT?: string;
  RECEIPT_RECOGNITION_HTTP_API_KEY?: string;
  RECEIPT_RECOGNITION_HTTP_TIMEOUT_MS?: string;
  NODE_ENV?: string;
}

export interface CreateReceiptRecognitionProviderOptions {
  env?: ReceiptRecognitionEnvironment;
  fetch?: typeof fetch;
  allowInsecureEndpoint?: boolean;
}

function requiredSetting(
  env: ReceiptRecognitionEnvironment,
  key:
    | "RECEIPT_RECOGNITION_HTTP_ENDPOINT"
    | "RECEIPT_RECOGNITION_HTTP_API_KEY",
) {
  const value = env[key]?.trim();
  if (!value) {
    throw new ReceiptRecognitionError(
      "PROVIDER_CONFIGURATION_ERROR",
      `HTTP recognition mode requires ${key}`,
      500,
    );
  }
  return value;
}

function parseTimeout(value: string | undefined) {
  if (value === undefined || value.trim() === "") return undefined;
  const timeout = Number(value);
  if (!Number.isInteger(timeout)) {
    throw new ReceiptRecognitionError(
      "PROVIDER_CONFIGURATION_ERROR",
      "RECEIPT_RECOGNITION_HTTP_TIMEOUT_MS must be an integer",
      500,
    );
  }
  return timeout;
}

export function createReceiptRecognitionProvider(
  options: CreateReceiptRecognitionProviderOptions = {},
): ReceiptRecognitionProvider {
  const env = options.env ?? process.env;
  const mode = env.RECEIPT_RECOGNITION_PROVIDER?.trim().toLowerCase() || "mock";

  if (mode === "mock") return new MockReceiptRecognitionProvider();
  if (mode !== "http") {
    throw new ReceiptRecognitionError(
      "PROVIDER_CONFIGURATION_ERROR",
      `Unsupported screenshot recognition provider: ${mode}`,
      500,
    );
  }

  const httpOptions: HttpJsonReceiptRecognitionProviderOptions = {
    endpoint: requiredSetting(env, "RECEIPT_RECOGNITION_HTTP_ENDPOINT"),
    apiKey: requiredSetting(env, "RECEIPT_RECOGNITION_HTTP_API_KEY"),
    timeoutMs: parseTimeout(env.RECEIPT_RECOGNITION_HTTP_TIMEOUT_MS),
    fetch: options.fetch,
    allowInsecureEndpoint: options.allowInsecureEndpoint,
    runtimeEnvironment: env.NODE_ENV,
  };
  return new HttpJsonReceiptRecognitionProvider(httpOptions);
}
