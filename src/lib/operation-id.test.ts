import { afterEach, expect, it, vi } from "vitest";
import { createOperationId } from "./operation-id";

afterEach(() => vi.unstubAllGlobals());

it("generates distinct UUIDs when local HTTP lacks randomUUID", () => {
  const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  vi.stubGlobal("crypto", { getRandomValues });
  const first = createOperationId();
  expect(first).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  expect(createOperationId()).not.toBe(first);
});
