import { describe, expect, it } from "vitest";

import {
  getApiError,
  readApiPayload,
  unwrapApiData,
} from "@/lib/client-api";

describe("client API envelope helpers", () => {
  it("unwraps successful data envelopes and rejects malformed payloads", () => {
    expect(unwrapApiData<{ id: string }>({ data: { id: "item-1" } })).toEqual({
      id: "item-1",
    });
    expect(unwrapApiData({ data: null })).toBeNull();
    expect(unwrapApiData({ id: "not-an-envelope" })).toBeNull();
  });

  it("extracts structured and legacy string errors", () => {
    expect(
      getApiError({ error: { code: "INVALID", message: "Invalid content" } }, "Failed"),
    ).toBe("Invalid content");
    expect(getApiError({ error: "Legacy error" }, "Failed")).toBe("Legacy error");
    expect(getApiError({ error: { message: "" } }, "Failed")).toBe("Failed");
  });

  it("reads JSON responses and safely handles invalid or non-JSON bodies", async () => {
    await expect(
      readApiPayload(
        new Response(JSON.stringify({ data: { ok: true } }), {
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
      ),
    ).resolves.toEqual({ data: { ok: true } });
    await expect(
      readApiPayload(
        new Response("not-json", {
          headers: { "content-type": "application/json" },
        }),
      ),
    ).resolves.toBeNull();
    await expect(readApiPayload(new Response("plain text"))).resolves.toBeNull();
  });
});
