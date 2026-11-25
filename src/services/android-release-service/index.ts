import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

export const androidReleaseManifestSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u),
    versionCode: z.number().int().positive(),
    fileName: z.string().min(1).max(200),
    sizeBytes: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    minAndroid: z.string().min(1).max(80),
    architectures: z.array(z.string().min(1).max(40)).min(1).max(8),
    publishedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type AndroidReleaseManifest = z.infer<
  typeof androidReleaseManifestSchema
>;

export type AndroidRelease = {
  manifest: AndroidReleaseManifest;
  filePath: string;
  etag: string;
};

type CachedRelease = {
  root: string;
  manifestModifiedAt: number;
  apkModifiedAt: number;
  release: AndroidRelease;
};

let cachedRelease: CachedRelease | null = null;

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

export async function readAndroidRelease(
  releaseRoot = process.env.ANDROID_RELEASE_ROOT,
): Promise<AndroidRelease | null> {
  if (!releaseRoot) return null;

  try {
    const root = await realpath(releaseRoot);
    const manifestPath = path.join(root, "release.json");
    const manifestStat = await stat(manifestPath);
    const manifest = androidReleaseManifestSchema.parse(
      JSON.parse(await readFile(manifestPath, "utf8")),
    );
    if (path.basename(manifest.fileName) !== manifest.fileName) return null;

    const filePath = path.join(root, manifest.fileName);
    const fileInfo = await lstat(filePath);
    if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) return null;
    const resolvedFile = await realpath(filePath);
    if (path.dirname(resolvedFile) !== root) return null;

    if (
      cachedRelease?.root === root &&
      cachedRelease.manifestModifiedAt === manifestStat.mtimeMs &&
      cachedRelease.apkModifiedAt === fileInfo.mtimeMs
    ) {
      return cachedRelease.release;
    }

    if (fileInfo.size !== manifest.sizeBytes) return null;
    if ((await sha256File(filePath)) !== manifest.sha256) return null;

    const release = {
      manifest,
      filePath,
      etag: `"${manifest.sha256}"`,
    };
    cachedRelease = {
      root,
      manifestModifiedAt: manifestStat.mtimeMs,
      apkModifiedAt: fileInfo.mtimeMs,
      release,
    };
    return release;
  } catch {
    return null;
  }
}
