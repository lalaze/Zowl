import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiRequestError,
  getApiError,
  readApiPayload,
  requestApi,
  unwrapApiData,
} from "@/lib/client-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("requestApi", () => {
  it("serializes JSON bodies and unwraps the data envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "cat-1" } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const created = await requestApi<{ id: string }>("/api/categories", {
      method: "POST",
      json: { name: "Food" },
      fallbackError: "Failed to create",
      requireData: true,
    });

    expect(created).toEqual({ id: "cat-1" });
    expect(fetchMock).toHaveBeenCalledWith("/api/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Food" }),
    });
  });

  it("throws ApiRequestError with server message or fallback on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { message: "Category already exists" } }),
            {
              status: 409,
              headers: { "content-type": "application/json" },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: { message: "   " } }), {
            status: 400,
            headers: { "content-type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(new Response("Bad gateway", { status: 502 })),
    );

    await expect(
      requestApi("/api/categories", {
        method: "POST",
        json: { name: "Food" },
        fallbackError: "Fallback error",
      }),
    ).rejects.toSatisfy(
      (caught: unknown) =>
        caught instanceof ApiRequestError &&
        caught.status === 409 &&
        caught.message === "Category already exists",
    );

    await expect(
      requestApi("/api/categories", {
        method: "POST",
        json: { name: "Food" },
        fallbackError: "Fallback error",
      }),
    ).rejects.toSatisfy(
      (caught: unknown) =>
        caught instanceof ApiRequestError &&
        caught.status === 400 &&
        caught.message === "Fallback error",
    );

    await expect(
      requestApi("/api/categories", {
        method: "DELETE",
        fallbackError: "Delete failed",
      }),
    ).rejects.toSatisfy(
      (caught: unknown) =>
        caught instanceof ApiRequestError &&
        caught.status === 502 &&
        caught.message === "Delete failed",
    );
  });

  it("returns null when data is absent unless requireData is set", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
    );

    await expect(
      requestApi("/api/categories/1", {
        method: "DELETE",
        fallbackError: "Delete failed",
      }),
    ).resolves.toBeNull();

    await expect(
      requestApi("/api/categories/1", {
        method: "GET",
        fallbackError: "Missing data",
        requireData: true,
      }),
    ).rejects.toSatisfy(
      (caught: unknown) =>
        caught instanceof ApiRequestError && caught.message === "Missing data",
    );
  });

  it("lets network failures reject as non-ApiRequestError so callers can distinguish them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(
      requestApi("/api/categories", { fallbackError: "Server error" }),
    ).rejects.toSatisfy(
      (caught: unknown) =>
        caught instanceof TypeError && !(caught instanceof ApiRequestError),
    );
  });

  it("omits init argument when no fetch options are provided and passes FormData body through", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await requestApi("/api/captures/notifications", {
      fallbackError: "Refresh failed",
    });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/captures/notifications");

    const formData = new FormData();
    formData.set("k", "v");
    await requestApi("/api/imports/screenshots", {
      method: "POST",
      body: formData,
      fallbackError: "Upload failed",
    });
    expect(fetchMock).toHaveBeenLastCalledWith("/api/imports/screenshots", {
      method: "POST",
      body: formData,
    });
  });
});
