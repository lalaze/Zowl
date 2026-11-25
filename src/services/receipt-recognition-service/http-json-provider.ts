import {
  receiptRecognitionJsonSchema,
  receiptRecognitionResultSchema,
  type ReceiptRecognitionResult,
} from "@/services/receipt-recognition-service/schema";
import { ReceiptRecognitionError } from "@/services/receipt-recognition-service/error";
import { assertReceiptRecognitionInput } from "@/services/receipt-recognition-service/input";
import type {
  ReceiptRecognitionInput,
  ReceiptRecognitionProvider,
} from "@/services/receipt-recognition-service/types";

export interface HttpJsonReceiptRecognitionProviderOptions {
  endpoint: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  allowInsecureEndpoint?: boolean;
  runtimeEnvironment?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 120_000;
export const MAX_PROVIDER_RESPONSE_BYTES = 1024 * 1024;
/** Warnings are shown to the uploader as-is, so they follow their UI language. */
const warningLanguage = { en: "English", zh: "Simplified Chinese" } as const;

const nullableProviderStringKeys = new Set([
  "currency",
  "merchantName",
  "description",
  "transactionTime",
  "paymentMethod",
  "platformTransactionId",
  "status",
  "suggestedCategory",
]);

function normalizeEmptyProviderStrings(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      if (nullableProviderStringKeys.has(key) && typeof value === "string") {
        const trimmed = value.trim();
        return [key, trimmed === "" ? null : trimmed];
      }
      if (key === "warnings" && Array.isArray(value)) {
        return [
          key,
          value.map((warning) =>
            typeof warning === "string" ? warning.trim() : warning,
          ),
        ];
      }
      return [key, value];
    }),
  );
}

function isJsonContentType(value: string | null) {
  const mediaType = value?.split(";", 1)[0]?.trim().toLowerCase();
  return (
    mediaType === "application/json" ||
    (mediaType?.startsWith("application/") && mediaType.endsWith("+json")) ||
    false
  );
}

async function readLimitedJson(
  response: Response,
  setActiveReader: (
    reader: ReadableStreamDefaultReader<Uint8Array> | undefined,
  ) => void,
) {
  if (!isJsonContentType(response.headers.get("content-type"))) {
    void response.body?.cancel().catch(() => undefined);
    throw new ReceiptRecognitionError(
      "INVALID_PROVIDER_CONTENT_TYPE",
      "Screenshot recognition service did not return JSON content. Complete manually",
      502,
    );
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw new ReceiptRecognitionError(
      "PROVIDER_RESPONSE_TOO_LARGE",
      "Screenshot recognition response is too large. Complete manually",
      502,
    );
  }
  if (!response.body) {
    throw new ReceiptRecognitionError(
      "INVALID_PROVIDER_JSON",
      "Screenshot recognition service did not return valid JSON. Complete the fields manually",
      502,
    );
  }

  const reader = response.body.getReader();
  setActiveReader(reader);
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalLength += value.byteLength;
      if (totalLength > MAX_PROVIDER_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new ReceiptRecognitionError(
          "PROVIDER_RESPONSE_TOO_LARGE",
          "Screenshot recognition response is too large. Complete manually",
          502,
        );
      }
      chunks.push(value);
    }
  } finally {
    setActiveReader(undefined);
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ReceiptRecognitionError(
      "INVALID_PROVIDER_JSON",
      "Screenshot recognition service did not return valid JSON. Complete the fields manually",
      502,
    );
  }
}

function validateOptions(options: HttpJsonReceiptRecognitionProviderOptions) {
  let endpoint: URL;
  try {
    endpoint = new URL(options.endpoint);
  } catch {
    throw new ReceiptRecognitionError(
      "PROVIDER_CONFIGURATION_ERROR",
      "Recognition service endpoint is not valid URL",
      500,
    );
  }
  if (!(endpoint.protocol === "https:" || endpoint.protocol === "http:")) {
    throw new ReceiptRecognitionError(
      "PROVIDER_CONFIGURATION_ERROR",
      "Recognition service endpoint Only supports HTTP or HTTPS",
      500,
    );
  }
  const isProduction =
    process.env.NODE_ENV === "production" ||
    options.runtimeEnvironment === "production";
  if (
    endpoint.protocol !== "https:" &&
    (!options.allowInsecureEndpoint || isProduction)
  ) {
    throw new ReceiptRecognitionError(
      "PROVIDER_CONFIGURATION_ERROR",
      "Recognition service endpoint must use HTTPS",
      500,
    );
  }
  if (!options.apiKey.trim() || /[\r\n]/u.test(options.apiKey)) {
    throw new ReceiptRecognitionError(
      "PROVIDER_CONFIGURATION_ERROR",
      "Recognition service API Key configuration is incomplete",
      500,
    );
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < MIN_TIMEOUT_MS ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new ReceiptRecognitionError(
      "PROVIDER_CONFIGURATION_ERROR",
      `Recognition timeout must be an integer between ${MIN_TIMEOUT_MS} to ${MAX_TIMEOUT_MS} milliseconds`,
      500,
    );
  }
  return {
    endpoint: endpoint.toString(),
    apiKey: options.apiKey.trim(),
    timeoutMs,
  };
}

export class HttpJsonReceiptRecognitionProvider
  implements ReceiptRecognitionProvider
{
  readonly name = "http";
  readonly sendsImagesToThirdParty = true;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly request: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpJsonReceiptRecognitionProviderOptions) {
    const validated = validateOptions(options);
    this.endpoint = validated.endpoint;
    this.apiKey = validated.apiKey;
    this.request = options.fetch ?? globalThis.fetch;
    this.timeoutMs = validated.timeoutMs;
    if (typeof this.request !== "function") {
      throw new ReceiptRecognitionError(
        "PROVIDER_CONFIGURATION_ERROR",
        "The current runtime has no available fetch",
        500,
      );
    }
  }

  async recognize(
    input: ReceiptRecognitionInput,
  ): Promise<ReceiptRecognitionResult> {
    assertReceiptRecognitionInput(input);
    const controller = new AbortController();
    let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(
          new ReceiptRecognitionError(
            "PROVIDER_TIMEOUT",
            "Screenshot recognition timed out. Retry later or complete manually",
            504,
          ),
        );
        void activeReader?.cancel().catch(() => undefined);
      }, this.timeoutMs);
    });

    let payload: unknown;
    try {
      const exchange = async () => {
        const response = await this.request(this.endpoint, {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            instructions: `Extract only transaction facts explicitly visible in the image. Never guess, fill gaps, or use the current time. Return null for uncertain fields and strictly follow the provided JSON Schema. Write warnings in ${warningLanguage[input.locale]} and preserve original merchant names and transaction descriptions.`,
            image: {
              base64: Buffer.from(input.bytes).toString("base64"),
              mimeType: input.mimeType,
            },
            responseFormat: {
              type: "json_schema",
              name: "receipt_recognition",
              strict: true,
              schema: receiptRecognitionJsonSchema,
            },
          }),
          signal: controller.signal,
          redirect: "manual",
        });

        if (!response.ok) {
          void response.body?.cancel().catch(() => undefined);
          throw new ReceiptRecognitionError(
            "PROVIDER_HTTP_ERROR",
            "Screenshot recognition service returned an error. Retry later or complete manually",
            502,
            response.status,
          );
        }

        return readLimitedJson(response, (reader) => {
          activeReader = reader;
        });
      };

      payload = await Promise.race([exchange(), timeoutPromise]);
    } catch (error) {
      if (error instanceof ReceiptRecognitionError) throw error;
      if (controller.signal.aborted) {
        throw new ReceiptRecognitionError(
          "PROVIDER_TIMEOUT",
          "Screenshot recognition timed out. Retry later or complete manually",
          504,
        );
      }
      throw new ReceiptRecognitionError(
        "PROVIDER_REQUEST_FAILED",
        "Screenshot recognition is temporarily unavailable. Retry later or complete manually",
        502,
      );
    } finally {
      if (timeout) clearTimeout(timeout);
    }

    const parsed = receiptRecognitionResultSchema.safeParse(
      normalizeEmptyProviderStrings(payload),
    );
    if (!parsed.success) {
      throw new ReceiptRecognitionError(
        "INVALID_PROVIDER_RESULT",
        "Screenshot recognition result has an invalid format. Complete manually",
        502,
      );
    }
    return parsed.data;
  }
}
