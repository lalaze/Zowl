import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  applyBuiltInNames: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/services/category-management-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/category-management-service")>()),
  categoryManagementService: { applyBuiltInNames: mocks.applyBuiltInNames },
}));

import { POST } from "./route";

function post(body: string, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/categories/built-in-names", {
      method: "POST",
      headers: { host: "localhost", "content-type": "application/json", ...headers },
      body,
    }),
  );
}

describe("POST /api/categories/built-in-names", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-a" });
    mocks.applyBuiltInNames.mockReturnValue({ renamed: 13, skipped: 1, categories: [], rules: [] });
  });

  it("renames the signed-in user's built-ins to the requested language", async () => {
    const response = await post(JSON.stringify({ locale: "zh" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { renamed: 13, skipped: 1, categories: [], rules: [] },
    });
    expect(mocks.applyBuiltInNames).toHaveBeenCalledWith("user-a", "zh");
  });

  it("requires a session and a same-origin request", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await post(JSON.stringify({ locale: "zh" }))).status).toBe(401);

    const crossOrigin = await post(JSON.stringify({ locale: "zh" }), {
      origin: "https://attacker.example",
    });
    expect(crossOrigin.status).toBe(403);
    expect(mocks.applyBuiltInNames).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies and unsupported languages", async () => {
    expect((await post("{")).status).toBe(400);
    const unsupported = await post(JSON.stringify({ locale: "fr" }));
    expect(unsupported.status).toBe(422);
    expect((await unsupported.json()).error).toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: { locale: expect.any(Array) },
    });
    expect(mocks.applyBuiltInNames).not.toHaveBeenCalled();
  });
});
