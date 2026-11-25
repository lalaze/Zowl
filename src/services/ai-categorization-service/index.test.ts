import { describe, expect, it, vi } from "vitest";

import {
  AiCategorizationError,
  createAiCategorizationRuntime,
  createSafeAiCategorizationRuntime,
  isLoopbackAiProviderHostname,
  isPrivateAiProviderHostname,
  OpenAiCompatibleCategorizationProvider,
  sanitizeAiCategoryBatchInput,
  type AiCategoryBatchInput,
  type OrderDetailsInput,
} from "@/services/ai-categorization-service";

const input: AiCategoryBatchInput = {
  categories: [
    { id: "food", name: "Food", kind: "expense" },
    { id: "other", name: "Other", kind: "both" },
  ],
  items: [
    {
      itemRef: "item-1",
      type: "expense",
      source: "wechat",
      merchantName: "Lumora Joy Shop",
      description: "Order:10002000300040005000600070008",
    },
  ],
  locale: "en",
};

function chatResponse(content: unknown, status = 200) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content } }],
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function provider(request: ReturnType<typeof vi.fn>) {
  return new OpenAiCompatibleCategorizationProvider({
    baseUrl: "https://api.example.test/v1",
    model: "category-model",
    apiKey: "secret",
    fetch: request as unknown as typeof fetch,
    timeoutMs: 100,
  });
}

describe("OpenAI-compatible AI categorization provider", () => {
  it("sanitizes identifiers, requests strict JSON Schema, and validates output", async () => {
    const request = vi.fn(async () =>
      chatResponse(
        JSON.stringify({
          results: [
            {
              itemRef: "item-1",
              categoryId: "food",
              confidence: 0.98,
              ambiguous: false,
              reason: "Tea shop",
            },
          ],
        }),
      ),
    );

    await expect(provider(request).classifyBatch(input)).resolves.toEqual([
      {
        itemRef: "item-1",
        categoryId: "food",
        confidence: 0.98,
        ambiguous: false,
        reason: "Tea shop",
      },
    ]);

    const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.test/v1/chat/completions");
    expect(init.redirect).toBe("manual");
    expect(init.headers).toMatchObject({ authorization: "Bearer secret" });
    const body = JSON.parse(String(init.body));
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        strict: true,
        schema: { additionalProperties: false },
      },
    });
    const userPayload = JSON.parse(body.messages[1].content);
    expect(userPayload.transactions[0].description).toBe("Order:[ID]");
    expect(String(init.body)).not.toContain("10002000300040005000600070008");
    expect(body.messages[0].content).toContain("Write reasons in English.");
  });

  it("asks for reasons in Simplified Chinese for Chinese requesters", async () => {
    const request = vi.fn(async () =>
      chatResponse(
        JSON.stringify({
          results: [
            {
              itemRef: "item-1",
              categoryId: "food",
              confidence: 0.9,
              ambiguous: false,
              reason: "奶茶店",
            },
          ],
        }),
      ),
    );

    await expect(
      provider(request).classifyBatch({ ...input, locale: "zh" }),
    ).resolves.toMatchObject([{ reason: "奶茶店" }]);
    const [, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.messages[0].content).toContain("Write reasons in Simplified Chinese.");
    expect(JSON.parse(body.messages[1].content)).not.toHaveProperty("locale");
  });

  it("accepts fenced JSON from a compatible local model in json_object mode", async () => {
    const request = vi.fn(async () =>
      chatResponse(
        "```json\n{\"results\":[{\"itemRef\":\"item-1\",\"categoryId\":null,\"confidence\":0.4,\"ambiguous\":true,\"reason\":\"Insufficient information\"}]}\n```",
      ),
    );
    const local = new OpenAiCompatibleCategorizationProvider({
      baseUrl: "http://127.0.0.1:11434/v1/",
      model: "local-model",
      responseMode: "json_object",
      allowInsecureHttp: true,
      fetch: request as unknown as typeof fetch,
    });

    await expect(local.classifyBatch(input)).resolves.toMatchObject([
      { categoryId: null, ambiguous: true },
    ]);
    const [, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(local.sendsDataToThirdParty).toBe(false);
  });

  it.each([
    ["unknown item", { itemRef: "other", categoryId: "food" }],
    ["unknown category", { itemRef: "item-1", categoryId: "private" }],
  ])("rejects %s in model output", async (_scenario, changed) => {
    const request = vi.fn(async () =>
      chatResponse(
        JSON.stringify({
          results: [
            Object.assign(
              {
                itemRef: "item-1",
                categoryId: "food",
                confidence: 0.9,
                ambiguous: false,
                reason: "test",
              },
              changed,
            ),
          ],
        }),
      ),
    );
    await expect(provider(request).classifyBatch(input)).rejects.toMatchObject({
      code: "INVALID_PROVIDER_RESULT",
    });
  });

  it("does not expose provider response bodies or credentials on HTTP errors", async () => {
    const request = vi.fn(async () =>
      new Response("private provider detail", { status: 429 }),
    );
    const error = await provider(request)
      .classifyBatch(input)
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({
      code: "PROVIDER_HTTP_ERROR",
      providerStatus: 429,
    });
    expect((error as Error).message).not.toContain("private provider detail");
    expect((error as Error).message).not.toContain("secret");
  });

  it.each([
    [
      "non-JSON content",
      () => new Response("ok", { headers: { "content-type": "text/plain" } }),
      "INVALID_PROVIDER_CONTENT_TYPE",
    ],
    [
      "invalid JSON",
      () =>
        new Response("{", {
          headers: { "content-type": "application/json" },
        }),
      "INVALID_PROVIDER_JSON",
    ],
    [
      "an oversized declared response",
      () =>
        new Response("{}", {
          headers: {
            "content-type": "application/json",
            "content-length": String(1024 * 1024 + 1),
          },
        }),
      "PROVIDER_RESPONSE_TOO_LARGE",
    ],
  ])("rejects %s", async (_scenario, response, code) => {
    const request = vi.fn(async () => response());
    await expect(provider(request).classifyBatch(input)).rejects.toMatchObject({
      code,
    });
  });

  it("reports model refusals without accepting partial output", async () => {
    const request = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { role: "assistant", content: null, refusal: "no" } },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await expect(provider(request).classifyBatch(input)).rejects.toMatchObject({
      code: "PROVIDER_REFUSAL",
    });
  });

  it("aborts slow provider requests at the configured timeout", async () => {
    const request = vi.fn(
      async (_url: string, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    await expect(provider(request).classifyBatch(input)).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      status: 504,
    });
  });

  it("requires explicit insecure HTTP and an API key for public services", () => {
    expect(
      () =>
        new OpenAiCompatibleCategorizationProvider({
          baseUrl: "http://127.0.0.1:11434/v1",
          model: "local",
        }),
    ).toThrow(AiCategorizationError);
    expect(
      () =>
        new OpenAiCompatibleCategorizationProvider({
          baseUrl: "https://remote.example.test/v1",
          model: "remote",
        }),
    ).toThrow(/API Key/u);
    expect(
      () =>
        new OpenAiCompatibleCategorizationProvider({
          baseUrl: "http://remote.example.test/v1",
          model: "remote",
          apiKey: "secret",
          allowInsecureHttp: true,
        }),
    ).not.toThrow();
    expect(
      () =>
        new OpenAiCompatibleCategorizationProvider({
          baseUrl: "http://192.168.1.10:11434/v1",
          model: "private-model",
          allowInsecureHttp: true,
        }),
    ).not.toThrow();
    expect(
      () =>
        new OpenAiCompatibleCategorizationProvider({
          baseUrl: "https://user:password@example.test/v1",
          model: "invalid",
          apiKey: "secret",
        }),
    ).toThrow(/credentials/u);
  });
});

describe("AI provider network classification", () => {
  it.each([
    ["localhost", true],
    ["127.0.0.2", true],
    ["192.168.10.20", true],
    ["10.1.2.3", true],
    ["172.31.4.5", true],
    ["100.64.1.2", true],
    ["169.254.10.2", true],
    ["fd00::1", true],
    ["fe80::1", true],
    ["model.home.arpa", true],
    ["api.openai.example", false],
    ["8.8.8.8", false],
  ])("classifies %s private=%s", (hostname, expected) => {
    expect(isPrivateAiProviderHostname(hostname)).toBe(expected);
  });

  it("distinguishes server loopback from private-network services", () => {
    expect(isLoopbackAiProviderHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackAiProviderHostname("192.168.1.2")).toBe(false);
  });
});

describe("AI categorization runtime", () => {
  it("is off by default and applies documented defaults", () => {
    const runtime = createAiCategorizationRuntime({ env: {} });
    expect(runtime.provider.enabled).toBe(false);
    expect(runtime.autoThreshold).toBe(0.85);
    expect(runtime.batchSize).toBe(20);
    expect(runtime.metadata.mode).toBe("off");
  });

  it("creates local metadata without requiring an API key", () => {
    const runtime = createAiCategorizationRuntime({
      env: {
        AI_CATEGORIZATION_PROVIDER: "openai-compatible",
        AI_CATEGORIZATION_BASE_URL: "http://localhost:11434/v1",
        AI_CATEGORIZATION_MODEL: "qwen",
        AI_CATEGORIZATION_ALLOW_INSECURE_HTTP: "true",
      },
    });
    expect(runtime.metadata).toMatchObject({
      mode: "local",
      enabled: true,
      sendsDataToThirdParty: false,
      model: "qwen",
    });
  });

  it("degrades invalid configuration without throwing from the safe factory", () => {
    const runtime = createSafeAiCategorizationRuntime({
      env: { AI_CATEGORIZATION_PROVIDER: "openai-compatible" },
    });
    expect(runtime.metadata.mode).toBe("unavailable");
    expect(runtime.provider.enabled).toBe(false);
  });
});

describe("AI categorization sanitization", () => {
  it("removes long identifiers, email addresses, and URLs", () => {
    const sanitized = sanitizeAiCategoryBatchInput({
      ...input,
      items: [
        {
          ...input.items[0]!,
          merchantName: "shop@example.com",
          description: "Order 1234567890 https://example.com/private",
        },
      ],
    });
    expect(sanitized.items[0]).toMatchObject({
      merchantName: "[Email]",
      description: "Order [ID] [Link]",
    });
  });
});

describe("order details from order-page text", () => {
  const orderInput: OrderDetailsInput = {
    platform: "taobao",
    amountMinor: 3_760,
    currency: "CNY",
    categories: [{ id: "stationery", name: "文具", kind: "expense" }],
    pages: [
      {
        source: "ocr",
        lines: [
          "订单号 10002000300040005000600070008",
          "客服 https://example.test/help",
          "   ",
          "晨光中性笔 0.5mm 黑色",
          "¥18.80",
        ],
      },
    ],
    locale: "zh",
  };
  const answer = {
    shopName: null,
    items: [{ name: "晨光中性笔", spec: " ", quantity: 2, price: 18.8 }],
    categoryId: "stationery",
    confidence: 0.9,
    ambiguous: false,
    reason: "文具",
  };

  it("gives reading an order longer than the configured timeout, and still ends", async () => {
    vi.useFakeTimers();
    try {
      let answerAfterMs = 60_000;
      const request = vi.fn(
        async (_url: string, init?: RequestInit): Promise<Response> =>
          new Promise((resolve, reject) => {
            setTimeout(() => resolve(chatResponse(JSON.stringify(answer))), answerAfterMs);
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      );
      const read = provider(request).extractOrderDetails(orderInput);
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(read).resolves.toMatchObject({ confidence: 0.9 });

      answerAfterMs = 200_000;
      const stuck = expect(
        provider(request).extractOrderDetails(orderInput),
      ).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
      await vi.advanceTimersByTimeAsync(75_000);
      await stuck;
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends cleaned page text under a strict schema and returns the parsed goods", async () => {
    const request = vi.fn(async () => chatResponse(JSON.stringify(answer)));

    await expect(
      provider(request).extractOrderDetails(orderInput),
    ).resolves.toEqual({
      ...answer,
      items: [{ name: "晨光中性笔", spec: null, quantity: 2, price: 18.8 }],
    });

    const [, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "order_details",
        strict: true,
        schema: { additionalProperties: false },
      },
    });
    expect(
      body.response_format.json_schema.schema.properties.categoryId.anyOf[0].enum,
    ).toEqual(["stationery"]);
    const userPayload = JSON.parse(body.messages[1].content);
    expect(userPayload).toMatchObject({ platform: "taobao", amountPaid: "37.60" });
    expect(userPayload.pages).toEqual([
      {
        source: "ocr",
        lines: ["订单号 [ID]", "客服 [Link]", "晨光中性笔 0.5mm 黑色", "¥18.80"],
      },
    ]);
    expect(String(init.body)).not.toContain("10002000300040005000600070008");
    expect(body.messages[0].content).toContain("untrusted data");
    expect(body.messages[0].content).toContain("Simplified Chinese");
  });

  it("spells out the answer's shape for services that do not enforce a schema", async () => {
    const request = vi.fn(async () => chatResponse(JSON.stringify(answer)));
    await provider(request).extractOrderDetails(orderInput);
    const [, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).messages[0].content).toContain(
      '{"shopName": string or null, "items": [{"name": string',
    );
  });

  // A real model behind a proxy that ignores the schema: the shop
  // came back on the item and the order had no shopName at all.
  it("reads an answer whose fields are misplaced, missing or mistyped", async () => {
    const request = vi.fn(async () =>
      chatResponse(
        JSON.stringify({
          items: [
            {
              name: "云朵洗手液",
              spec: "24包",
              quantity: "1",
              price: "¥16.5",
              shopName: "云朵官方旗舰店",
            },
            { spec: "no name" },
            "not an item",
            { name: "保鲜膜", quantity: 1.5, price: "many" },
          ],
          categoryId: "elsewhere",
          confidence: "high",
          ambiguous: false,
          extra: true,
        }),
      ),
    );
    await expect(
      provider(request).extractOrderDetails(orderInput),
    ).resolves.toEqual({
      shopName: "云朵官方旗舰店",
      items: [
        { name: "云朵洗手液", spec: "24包", quantity: 1, price: 16.5 },
        { name: "保鲜膜", spec: null, quantity: null, price: null },
      ],
      // A category that was not offered is no category, and so not a confident one.
      categoryId: null,
      confidence: 0,
      ambiguous: true,
      reason: "",
    });
  });

  it("rejects an answer without a list of items", async () => {
    for (const content of [{ ...answer, items: "none" }, ["x"], "plain text"]) {
      await expect(
        provider(
          vi.fn(async () => chatResponse(JSON.stringify(content))),
        ).extractOrderDetails(orderInput),
      ).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESULT" });
    }
  });

  it("offers no category when the user has none", async () => {
    const request = vi.fn(async () =>
      chatResponse(JSON.stringify({ ...answer, categoryId: null })),
    );
    await provider(request).extractOrderDetails({ ...orderInput, categories: [] });
    const [, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(
      JSON.parse(String(init.body)).response_format.json_schema.schema.properties
        .categoryId,
    ).toEqual({ type: "null" });
  });
});
