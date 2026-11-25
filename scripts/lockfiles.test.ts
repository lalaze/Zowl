import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

// Installing through a registry mirror writes the mirror's address into the
// lockfile. npm would then use it for everyone, and pub would resolve every
// package again. Replace the host with the official one before committing.
describe("lockfiles", () => {
  it("resolve npm packages from the official registry", () => {
    const lock = JSON.parse(read("package-lock.json")) as {
      packages: Record<string, { resolved?: string }>;
    };
    const hosts = new Set(
      Object.values(lock.packages).flatMap(({ resolved }) =>
        resolved ? [new URL(resolved).host] : [],
      ),
    );
    expect([...hosts].sort()).toEqual([
      "cdn.sheetjs.com",
      "registry.npmjs.org",
    ]);
  });

  it("resolve Dart packages from pub.dev", () => {
    const hosts = new Set(
      [...read("mobile/pubspec.lock").matchAll(/^\s+url: "(.+)"$/gmu)].map(
        ([, url]) => url,
      ),
    );
    expect([...hosts]).toEqual(["https://pub.dev"]);
  });
});
