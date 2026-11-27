import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { readAndroidRelease } from "@/services/android-release-service";

async function releaseFixture(overrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "zowl-release-"));
  const bytes = Buffer.from("signed-apk-fixture");
  await writeFile(path.join(root, "zowl.apk"), bytes);
  await writeFile(
    path.join(root, "release.json"),
    JSON.stringify({
      version: "1.2.3",
      versionCode: 12,
      fileName: "zowl.apk",
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      minAndroid: "Android 7.0+",
      architectures: ["arm64-v8a"],
      publishedAt: "2026-07-27T08:00:00.000Z",
      ...overrides,
    }),
  );
  return root;
}

describe("Android release service", () => {
  it("accepts a manifest only when the file metadata and hash match", async () => {
    const release = await readAndroidRelease(await releaseFixture());

    expect(release?.manifest).toMatchObject({
      version: "1.2.3",
      fileName: "zowl.apk",
      architectures: ["arm64-v8a"],
    });
    expect(release?.etag).toMatch(/^"[a-f0-9]{64}"$/u);
  });

  it("rejects missing, traversing and hash-mismatched releases", async () => {
    await expect(readAndroidRelease(undefined)).resolves.toBeNull();
    await expect(
      readAndroidRelease(await releaseFixture({ fileName: "../zowl.apk" })),
    ).resolves.toBeNull();
    await expect(
      readAndroidRelease(await releaseFixture({ sha256: "0".repeat(64) })),
    ).resolves.toBeNull();
  });
});
