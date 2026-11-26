import { afterEach, describe, expect, it, vi } from "vitest";

import { patchImportItem } from "./import-review-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("patchImportItem", () => {
  const messages = {
    fallback: "Operation failed",
    network: "Network connection failed. Try again later",
  };

  it("sends PATCH JSON and succeeds on OK JSON response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "item-1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await patchImportItem(
      "batch-1",
      "item-1",
      { action: "decision", decision: "skip" },
      messages,
    );

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/imports/files/batch-1/items/item-1",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "decision", decision: "skip" }),
      },
    );
  });

  it("returns server error message or fallback for non-OK JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: { message: "Row locked" } }), {
            status: 400,
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: {} }), { status: 400 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: { message: "" } }), {
            status: 400,
          }),
        ),
    );

    await expect(
      patchImportItem("b", "i", { action: "adopt_ai" }, messages),
    ).resolves.toEqual({ ok: false, error: "Row locked" });
    await expect(
      patchImportItem("b", "i", { action: "adopt_ai" }, messages),
    ).resolves.toEqual({ ok: false, error: "Operation failed" });
    // Preserves nullish-coalescing semantics on empty string messages.
    await expect(
      patchImportItem("b", "i", { action: "adopt_ai" }, messages),
    ).resolves.toEqual({ ok: false, error: "" });
  });

  it("returns the network error message when the body is non-JSON or fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("<html>502</html>", { status: 502 }))
        .mockRejectedValueOnce(new TypeError("Failed to fetch")),
    );

    await expect(
      patchImportItem("b", "i", { action: "adopt_ai" }, messages),
    ).resolves.toEqual({
      ok: false,
      error: "Network connection failed. Try again later",
    });
    await expect(
      patchImportItem("b", "i", { action: "adopt_ai" }, messages),
    ).resolves.toEqual({
      ok: false,
      error: "Network connection failed. Try again later",
    });
  });
});
