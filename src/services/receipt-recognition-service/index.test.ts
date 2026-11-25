import { describe, expect, it, vi } from "vitest";

import {
  createReceiptRecognitionProvider,
  HttpJsonReceiptRecognitionProvider,
  MockReceiptRecognitionProvider,
  MAX_PROVIDER_RESPONSE_BYTES,
  receiptRecognitionJsonSchema,
  receiptRecognitionResultSchema,
  ReceiptRecognitionError,
  type ReceiptRecognitionInput,
  type ReceiptRecognitionResult,
} from "@/services/receipt-recognition-service";

const image: ReceiptRecognitionInput = {
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  mimeType: "image/png",
  originalName: "receipt.png",
  locale: "en",
};

const recognized: ReceiptRecognitionResult = {
  type: "expense",
  amount: 35.8,
  currency: "CNY",
  merchantName: "Example merchant",
  description: "Lunch",
  transactionTime: "2026-07-15T13:24:01+08:00",
  paymentMethod: "Yu’e Bao",
  platformTransactionId: "trade-123",
  status: "Transaction successful",
  source: "screenshot",
  suggestedCategory: "Food",
  confidence: 0.93,
  warnings: [],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function httpProvider(request: ReturnType<typeof vi.fn>) {
  return new HttpJsonReceiptRecognitionProvider({
    endpoint: "https://recognition.example.test/v1/receipt",
    apiKey: "secret-key",
    fetch: request as unknown as typeof fetch,
    timeoutMs: 100,
  });
}

describe("receipt recognition result contract", () => {
  it("accepts the complete normalized result and exports a strict JSON Schema", () => {
    expect(receiptRecognitionResultSchema.parse(recognized)).toEqual(recognized);
    expect(receiptRecognitionJsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        amount: {
          anyOf: [
            { type: "number", exclusiveMinimum: 0, multipleOf: 0.01 },
            { type: "null" },
          ],
        },
        currency: {
          anyOf: [{ type: "string", pattern: "^[A-Z]{3}$" }, { type: "null" }],
        },
        source: { type: "string", const: "screenshot" },
      },
      required: [
        "type",
        "amount",
        "currency",
        "merchantName",
        "description",
        "transactionTime",
        "paymentMethod",
        "platformTransactionId",
        "status",
        "source",
        "suggestedCategory",
        "confidence",
        "warnings",
      ],
    });
  });

  it.each([
    ["unknown field", { ...recognized, rawText: "untrusted" }],
    ["invalid timestamp", { ...recognized, transactionTime: "2026-07-15" }],
    ["zero amount", { ...recognized, amount: 0 }],
    ["negative amount", { ...recognized, amount: -1 }],
    ["more than two decimals", { ...recognized, amount: 35.801 }],
    ["lowercase currency", { ...recognized, currency: "cny" }],
    ["unknown transaction type", { ...recognized, type: "payment" }],
    ["wrong source", { ...recognized, source: "manual" }],
    ["missing source", { ...recognized, source: undefined }],
    ["invalid confidence", { ...recognized, confidence: 1.01 }],
  ])("rejects %s", (_scenario, result) => {
    expect(receiptRecognitionResultSchema.safeParse(result).success).toBe(false);
  });
});

describe("MockReceiptRecognitionProvider", () => {
  it("returns only null facts and a manual-review warning by default", async () => {
    const result = await new MockReceiptRecognitionProvider().recognize(image);

    expect(result).toMatchObject({
      type: null,
      amount: null,
      currency: null,
      merchantName: null,
      description: null,
      transactionTime: null,
      paymentMethod: null,
      platformTransactionId: null,
      status: null,
      source: "screenshot",
      suggestedCategory: null,
      confidence: null,
    });
    expect(new MockReceiptRecognitionProvider().sendsImagesToThirdParty).toBe(
      false,
    );
    expect(result.warnings.join(" ")).toContain("Enter and confirm fields manually");
  });

  it("returns an injected fixed result without sharing mutable output", async () => {
    const provider = new MockReceiptRecognitionProvider(recognized);
    const first = await provider.recognize(image);
    first.warnings.push("caller mutation");

    await expect(provider.recognize(image)).resolves.toEqual(recognized);
  });

  it("rejects empty or oversized input before producing a result", async () => {
    const provider = new MockReceiptRecognitionProvider();

    await expect(
      provider.recognize({ ...image, bytes: new Uint8Array() }),
    ).rejects.toMatchObject({ code: "INVALID_IMAGE_INPUT" });
    await expect(
      provider.recognize({
        ...image,
        bytes: new Uint8Array(8 * 1024 * 1024 + 1),
      }),
    ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
  });
});

describe("HttpJsonReceiptRecognitionProvider", () => {
  it("sends base64 image data and the strict schema, then validates the result", async () => {
    const request = vi.fn(async () => jsonResponse(recognized));
    const result = await httpProvider(request).recognize(image);

    expect(result).toEqual(recognized);
    expect(httpProvider(request).sendsImagesToThirdParty).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://recognition.example.test/v1/receipt");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    expect(init.headers).toMatchObject({
      authorization: "Bearer secret-key",
      "content-type": "application/json",
    });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      instructions: expect.stringContaining("Never guess"),
      image: {
        base64: Buffer.from(image.bytes).toString("base64"),
        mimeType: "image/png",
      },
      responseFormat: {
        type: "json_schema",
        name: "receipt_recognition",
        strict: true,
        schema: { additionalProperties: false },
      },
    });
    expect(body.image).not.toHaveProperty("originalName");
    expect(body.instructions).toContain("Write warnings in English");
  });

  it("asks for warnings in Simplified Chinese for Chinese uploaders", async () => {
    const request = vi.fn(async () =>
      jsonResponse({ ...recognized, warnings: ["交易时间不完整"] }),
    );

    await expect(
      httpProvider(request).recognize({ ...image, locale: "zh" }),
    ).resolves.toMatchObject({ warnings: ["交易时间不完整"] });
    const [, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.instructions).toContain("Write warnings in Simplified Chinese");
    expect(body.instructions).toContain("preserve original merchant names");
  });

  it("rejects non-2xx responses without exposing the response body", async () => {
    const endpoint = "https://private-endpoint.example.test/recognize";
    const apiKey = "super-secret-provider-key";
    const provider = new HttpJsonReceiptRecognitionProvider({
      endpoint,
      apiKey,
      fetch: vi.fn(
        async () => jsonResponse({ secret: "provider detail" }, 429),
      ) as unknown as typeof fetch,
      timeoutMs: 100,
    });

    const error = await provider.recognize(image).catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      code: "PROVIDER_HTTP_ERROR",
      status: 502,
      providerStatus: 429,
    });
    const message = (error as Error).message;
    expect(message).not.toContain("provider detail");
    expect(message).not.toContain(endpoint);
    expect(message).not.toContain(apiKey);
  });

  it("separates malformed JSON from schema-invalid JSON", async () => {
    const malformed = httpProvider(
      vi.fn(async () =>
        new Response("{", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const noncompliant = httpProvider(
      vi.fn(async () => jsonResponse({ ...recognized, amount: -1 })),
    );

    await expect(malformed.recognize(image)).rejects.toMatchObject({
      code: "INVALID_PROVIDER_JSON",
    });
    await expect(noncompliant.recognize(image)).rejects.toMatchObject({
      code: "INVALID_PROVIDER_RESULT",
    });
  });

  it("normalizes empty provider strings to null before strict validation", async () => {
    const payload = {
      ...recognized,
      currency: "",
      merchantName: "  ",
      description: "",
      transactionTime: "",
      paymentMethod: "",
      platformTransactionId: "",
      status: "",
      suggestedCategory: "",
    };
    const result = await httpProvider(
      vi.fn(async () => jsonResponse(payload)),
    ).recognize(image);

    expect(result).toMatchObject({
      currency: null,
      merchantName: null,
      description: null,
      transactionTime: null,
      paymentMethod: null,
      platformTransactionId: null,
      status: null,
      suggestedCategory: null,
    });
  });

  it("requires a JSON Content-Type", async () => {
    const provider = httpProvider(
      vi.fn(
        async () =>
          new Response(JSON.stringify(recognized), {
            headers: { "content-type": "text/plain" },
          }),
      ),
    );

    await expect(provider.recognize(image)).rejects.toMatchObject({
      code: "INVALID_PROVIDER_CONTENT_TYPE",
    });
  });

  it.each([undefined, "1"])(
    "enforces the streamed 1 MiB response limit with Content-Length %s",
    async (contentLength) => {
      const headers = new Headers({ "content-type": "application/json" });
      if (contentLength) headers.set("content-length", contentLength);
      const provider = httpProvider(
        vi.fn(
          async () =>
            new Response(new Uint8Array(MAX_PROVIDER_RESPONSE_BYTES + 1), {
              headers,
            }),
        ),
      );

      await expect(provider.recognize(image)).rejects.toMatchObject({
        code: "PROVIDER_RESPONSE_TOO_LARGE",
      });
    },
  );

  it("does not follow redirects", async () => {
    const request = vi.fn(async () =>
      jsonResponse({ detail: "redirect" }, 302),
    );

    await expect(httpProvider(request).recognize(image)).rejects.toMatchObject({
      code: "PROVIDER_HTTP_ERROR",
      providerStatus: 302,
    });
    const [, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.redirect).toBe("manual");
  });

  it("rejects network failures and enforces its timeout even if fetch ignores abort", async () => {
    const failed = httpProvider(
      vi.fn(async () => {
        throw new Error("socket detail");
      }),
    );
    const hanging = httpProvider(
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    const hangingBody = httpProvider(
      vi.fn(
        async () =>
          new Response(new ReadableStream<Uint8Array>(), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    await expect(failed.recognize(image)).rejects.toMatchObject({
      code: "PROVIDER_REQUEST_FAILED",
      status: 502,
      message: expect.not.stringContaining("socket detail"),
    });
    await expect(hanging.recognize(image)).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      status: 504,
    });
    await expect(hangingBody.recognize(image)).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      status: 504,
    });
  });

  it("requires HTTPS except for an explicit non-production local override", () => {
    const base = {
      endpoint: "http://127.0.0.1:8787/recognize",
      apiKey: "local-key",
      fetch: vi.fn() as unknown as typeof fetch,
    };

    expect(() => new HttpJsonReceiptRecognitionProvider(base)).toThrowError(
      ReceiptRecognitionError,
    );
    expect(
      new HttpJsonReceiptRecognitionProvider({
        ...base,
        allowInsecureEndpoint: true,
        runtimeEnvironment: "development",
      }),
    ).toBeInstanceOf(HttpJsonReceiptRecognitionProvider);
    expect(
      () =>
        new HttpJsonReceiptRecognitionProvider({
          ...base,
          allowInsecureEndpoint: true,
          runtimeEnvironment: "production",
        }),
    ).toThrowError(ReceiptRecognitionError);
  });
});

describe("createReceiptRecognitionProvider", () => {
  it("defaults safely to Mock and constructs HTTP only from complete config", () => {
    expect(createReceiptRecognitionProvider({ env: {} })).toBeInstanceOf(
      MockReceiptRecognitionProvider,
    );

    const request = vi.fn(async () => jsonResponse(recognized));
    expect(
      createReceiptRecognitionProvider({
        env: {
          RECEIPT_RECOGNITION_PROVIDER: " HTTP ",
          RECEIPT_RECOGNITION_HTTP_ENDPOINT:
            "https://recognition.example.test/receipt",
          RECEIPT_RECOGNITION_HTTP_API_KEY: "secret",
          RECEIPT_RECOGNITION_HTTP_TIMEOUT_MS: "1000",
        },
        fetch: request as unknown as typeof fetch,
      }),
    ).toBeInstanceOf(HttpJsonReceiptRecognitionProvider);
  });

  it.each([
    [
      "missing endpoint",
      {
        RECEIPT_RECOGNITION_PROVIDER: "http",
        RECEIPT_RECOGNITION_HTTP_API_KEY: "secret",
      },
    ],
    [
      "missing API key",
      {
        RECEIPT_RECOGNITION_PROVIDER: "http",
        RECEIPT_RECOGNITION_HTTP_ENDPOINT: "https://example.test/receipt",
      },
    ],
    ["unknown mode", { RECEIPT_RECOGNITION_PROVIDER: "magic" }],
    [
      "invalid timeout",
      {
        RECEIPT_RECOGNITION_PROVIDER: "http",
        RECEIPT_RECOGNITION_HTTP_ENDPOINT: "https://example.test/receipt",
        RECEIPT_RECOGNITION_HTTP_API_KEY: "secret",
        RECEIPT_RECOGNITION_HTTP_TIMEOUT_MS: "forever",
      },
    ],
  ])("fails closed for %s", (_scenario, env) => {
    expect(() => createReceiptRecognitionProvider({ env })).toThrowError(
      ReceiptRecognitionError,
    );
    try {
      createReceiptRecognitionProvider({ env });
    } catch (error) {
      expect(error).toMatchObject({
        code: "PROVIDER_CONFIGURATION_ERROR",
        status: 500,
      });
    }
  });
});
