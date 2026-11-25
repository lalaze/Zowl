import { afterEach, describe, expect, it, vi } from "vitest";

import { isSameOrigin } from "@/lib/api-response";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isSameOrigin", () => {
  it("accepts native requests without an Origin header", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_BASE_URL", undefined);

    expect(isSameOrigin(new Request("https://money.example/api"))).toBe(true);
  });

  it("uses the configured HTTPS public origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_BASE_URL", "https://money.tailnet.example");

    expect(
      isSameOrigin(
        new Request("http://app:3000/api", {
          headers: { origin: "https://money.tailnet.example" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOrigin(
        new Request("http://app:3000/api", {
          headers: { origin: "https://attacker.example" },
        }),
      ),
    ).toBe(false);
  });

  it("rejects browser origins when production configuration is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_BASE_URL", undefined);

    expect(
      isSameOrigin(
        new Request("http://app:3000/api", {
          headers: { origin: "https://money.tailnet.example" },
        }),
      ),
    ).toBe(false);
  });
});
