import "dotenv/config";

import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  arm64SplitVersionCode,
  findDevelopmentEndpoint,
  type MobileVersion,
  parseMobileVersion,
} from "./android-release-model";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

async function secretEnvironment(name: string, fileName: string) {
  const direct = process.env[name];
  if (direct) return direct;
  const secretFile = process.env[fileName]?.trim();
  if (!secretFile) {
    throw new Error(`Missing ${name} or ${fileName}`);
  }
  return (await readFile(secretFile, "utf8")).replace(/\r?\n$/u, "");
}

function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; binary?: boolean } = {},
) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: options.binary ? undefined : "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim();
    throw new Error(
      `${command} ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`,
    );
  }
  return result.stdout;
}

async function androidBuildTool(name: string) {
  const sdkRoot =
    process.env.ANDROID_SDK_ROOT?.trim() ?? process.env.ANDROID_HOME?.trim();
  if (!sdkRoot) throw new Error("ANDROID_SDK_ROOT or ANDROID_HOME is required");
  const root = path.join(sdkRoot, "build-tools");
  const versions = (await readdir(root)).sort((left, right) =>
    right.localeCompare(left, undefined, { numeric: true }),
  );
  for (const version of versions) {
    const candidate = path.join(root, version, name);
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Try the next installed build-tools version.
    }
  }
  throw new Error(`Android build tool ${name} was not found`);
}

function sdkLabel(apiLevel: number) {
  const names: Record<number, string> = {
    24: "Android 7.0+",
    26: "Android 8.0+",
    28: "Android 9+",
    29: "Android 10+",
    30: "Android 11+",
    31: "Android 12+",
    33: "Android 13+",
    34: "Android 14+",
    35: "Android 15+",
  };
  return names[apiLevel] ?? `Android API ${apiLevel}+`;
}

export async function validateAndroidApk(
  apkPath: string,
  expected: MobileVersion,
) {
  const aapt = await androidBuildTool("aapt");
  const apksigner = await androidBuildTool("apksigner");
  const badging = run(aapt, ["dump", "badging", apkPath]).toString();
  if (badging.includes("application-debuggable")) {
    throw new Error("APK is debuggable");
  }

  const packageLine = /^package:.*versionCode='(\d+)'.*versionName='([^']+)'/mu.exec(
    badging,
  );
  const versionCode = packageLine
    ? Number.parseInt(packageLine[1], 10)
    : undefined;
  if (
    !packageLine ||
    versionCode !== arm64SplitVersionCode(expected.versionCode) ||
    packageLine[2] !== expected.version
  ) {
    throw new Error("APK version does not match mobile/pubspec.yaml");
  }

  const minSdk = /^sdkVersion:'(\d+)'/mu.exec(badging);
  if (!minSdk) throw new Error("APK minimum Android version is missing");

  const nativeCode = /^native-code:\s*(.+)$/mu.exec(badging)?.[1] ?? "";
  const architectures = [...nativeCode.matchAll(/'([^']+)'/gu)].map(
    (match) => match[1],
  );
  if (
    architectures.length !== 1 ||
    architectures[0] !== "arm64-v8a"
  ) {
    throw new Error("APK must contain only the arm64-v8a architecture");
  }

  const certificates = run(apksigner, [
    "verify",
    "--verbose",
    "--print-certs",
    apkPath,
  ]).toString();
  if (/Android Debug/iu.test(certificates)) {
    throw new Error("APK is signed with an Android Debug certificate");
  }

  const appBinary = run(
    "unzip",
    ["-p", apkPath, "lib/arm64-v8a/libapp.so"],
    { binary: true },
  ) as Buffer;
  const developmentEndpoint = findDevelopmentEndpoint(appBinary);
  if (developmentEndpoint) {
    throw new Error(`APK contains development endpoint ${developmentEndpoint}`);
  }

  return {
    versionCode,
    minAndroid: sdkLabel(Number.parseInt(minSdk[1], 10)),
    architectures,
  };
}

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));
  return hash.digest("hex");
}

async function main() {
  const repositoryRoot = path.resolve(import.meta.dirname, "..");
  const mobileRoot = path.join(repositoryRoot, "mobile");
  const expected = parseMobileVersion(
    await readFile(path.join(mobileRoot, "pubspec.yaml"), "utf8"),
  );
  const verifyOnlyIndex = process.argv.indexOf("--verify-apk");
  if (verifyOnlyIndex >= 0) {
    const candidate = process.argv[verifyOnlyIndex + 1];
    if (!candidate) throw new Error("--verify-apk requires an APK path");
    await validateAndroidApk(path.resolve(candidate), expected);
    console.log("APK validation passed.");
    return;
  }

  const apiBaseUrl = new URL(requiredEnvironment("API_BASE_URL"));
  if (apiBaseUrl.protocol !== "https:") {
    throw new Error("API_BASE_URL must use HTTPS for a release build");
  }
  const keystorePath = path.resolve(requiredEnvironment("ANDROID_KEYSTORE_PATH"));
  const signingEnvironment = {
    ...process.env,
    ANDROID_KEYSTORE_PATH: keystorePath,
    ANDROID_KEYSTORE_PASSWORD: await secretEnvironment(
      "ANDROID_KEYSTORE_PASSWORD",
      "ANDROID_KEYSTORE_PASSWORD_FILE",
    ),
    ANDROID_KEY_ALIAS: requiredEnvironment("ANDROID_KEY_ALIAS"),
    ANDROID_KEY_PASSWORD: await secretEnvironment(
      "ANDROID_KEY_PASSWORD",
      "ANDROID_KEY_PASSWORD_FILE",
    ),
  };
  run(
    "flutter",
    [
      "build",
      "apk",
      "--release",
      "--target-platform",
      "android-arm64",
      "--split-per-abi",
      `--dart-define=API_BASE_URL=${apiBaseUrl.origin}${apiBaseUrl.pathname.replace(/\/$/u, "")}`,
    ],
    { cwd: mobileRoot, env: signingEnvironment },
  );

  const builtApk = path.join(
    mobileRoot,
    "build/app/outputs/flutter-apk/app-arm64-v8a-release.apk",
  );
  const validation = await validateAndroidApk(builtApk, expected);
  const outputRoot = path.resolve(
    process.env.ANDROID_RELEASE_OUTPUT ?? path.join(repositoryRoot, "releases/android"),
  );
  await mkdir(outputRoot, { recursive: true });
  const fileName = `zowl-android-${expected.version}-arm64.apk`;
  const temporaryApk = path.join(outputRoot, `.${fileName}.tmp`);
  const outputApk = path.join(outputRoot, fileName);
  await copyFile(builtApk, temporaryApk);
  await rename(temporaryApk, outputApk);
  const fileInfo = await stat(outputApk);
  const manifest = {
    version: expected.version,
    versionCode: validation.versionCode,
    fileName,
    sizeBytes: fileInfo.size,
    sha256: await sha256File(outputApk),
    minAndroid: validation.minAndroid,
    architectures: validation.architectures,
    publishedAt: new Date().toISOString(),
  };
  const temporaryManifest = path.join(outputRoot, ".release.json.tmp");
  await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporaryManifest, path.join(outputRoot, "release.json"));
  console.log(`Android release published to ${outputRoot}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Release failed");
    process.exitCode = 1;
  });
}
