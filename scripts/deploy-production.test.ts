import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { deployProduction, type RunCommand } from "./deploy-production";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const temporaryRoots: string[] = [];

function temporaryRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), "zowl-production-deploy-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("production deployment", () => {
  it("builds Android before Tailstack and publishes it after the Web release", async () => {
    const root = temporaryRoot();
    const commands: Array<{
      command: string;
      args: string[];
      env?: NodeJS.ProcessEnv;
      input?: string;
    }> = [];
    const run: RunCommand = (command, args, options = {}) => {
      commands.push({
        command,
        args,
        env: options.env,
        input: options.input,
      });
      if (command === "ssh" && options.capture) {
        return "https://ledger.example.net/\n";
      }
      if (command === "git" && args.includes("--verify")) {
        return "0663b9d9e45c1234567890123456789012345678\n";
      }
      if (command === "git" && args.at(-1) === "HEAD") {
        return "0663b9d9e45c1234567890123456789012345678\n";
      }
      if (command === "git" && args.includes("--porcelain")) return "";
      if (command === "npm") {
        const output = options.env?.ANDROID_RELEASE_OUTPUT;
        if (!output) throw new Error("missing Android output");
        mkdirSync(output, { recursive: true });
        writeFileSync(path.join(output, "zowl-android-1.0.0-arm64.apk"), "apk");
        writeFileSync(
          path.join(output, "release.json"),
          `${JSON.stringify({
            version: "1.0.0",
            versionCode: 1,
            fileName: "zowl-android-1.0.0-arm64.apk",
            sizeBytes: 3,
            sha256: createHash("sha256").update("apk").digest("hex"),
            minAndroid: "Android 7.0+",
            architectures: ["arm64-v8a"],
            publishedAt: "2026-07-29T00:00:00.000Z",
          })}\n`,
        );
      }
      return "";
    };
    const verified: string[] = [];

    await deployProduction(["prod-host", "HEAD"], {
      repositoryRoot,
      run,
      makeTemporaryDirectory: () => path.join(root, "artifacts"),
      verifyPublishedRelease: async (url) => {
        verified.push(url);
      },
    });

    const commandNames = commands.map(({ command }) => command);
    expect(commandNames.indexOf("ssh")).toBeLessThan(
      commandNames.indexOf("npm"),
    );
    expect(commands.find(({ command }) => command === "ssh")?.args).toEqual([
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "prod-host",
      "sh",
      "-s",
      "--",
      ".tailstack/zowl",
    ]);
    expect(commandNames.indexOf("npm")).toBeLessThan(
      commandNames.indexOf("tailstack"),
    );
    expect(commandNames.indexOf("tailstack")).toBeLessThan(
      commandNames.indexOf("scp"),
    );
    expect(commandNames.indexOf("scp")).toBeLessThan(
      commandNames.lastIndexOf("ssh"),
    );
    expect(
      commands.find(({ command }) => command === "npm")?.env,
    ).toMatchObject({
      API_BASE_URL: "https://ledger.example.net",
    });
    expect(
      commands.find(({ command }) => command === "tailstack")?.args,
    ).toEqual([
      "deploy",
      "prod-host",
      "0663b9d9e45c1234567890123456789012345678",
    ]);
    expect(
      commands.filter(({ command }) => command === "ssh").at(-1)?.input,
    ).toContain(
      'mv "$temporary_manifest" "$release_dir/release.json"',
    );
    expect(verified).toEqual([
      "https://ledger.example.net/downloads/android/latest",
    ]);
  });

  it("requires an explicit SSH target", async () => {
    vi.stubEnv("TAILSTACK_SSH_TARGET", "");
    await expect(
      deployProduction([], {
        repositoryRoot,
        run: () => {
          throw new Error("must not run commands");
        },
      }),
    ).rejects.toThrow("Usage: npm run deploy:production");
  });

  it("stops before building when the host has no HTTPS public URL", async () => {
    const commands: string[] = [];
    const run: RunCommand = (command, args, options = {}) => {
      commands.push(command);
      if (command === "git" && args.includes("--porcelain")) return "";
      if (command === "git") {
        return "0663b9d9e45c1234567890123456789012345678\n";
      }
      if (command === "ssh" && options.capture) {
        return "http://ledger.example.net\n";
      }
      return "";
    };

    await expect(
      deployProduction(["prod-host", "HEAD"], { repositoryRoot, run }),
    ).rejects.toThrow("must use HTTPS");
    expect(commands).not.toContain("npm");
    expect(commands).not.toContain("tailstack");
  });

  it("publishes a verified APK before atomically replacing its manifest", () => {
    const root = temporaryRoot();
    const remoteRoot = path.join(root, ".tailstack/zowl");
    const incoming = path.join(remoteRoot, "incoming");
    const fixture = path.join(root, "fixture");
    const mockBin = path.join(root, "bin");
    mkdirSync(incoming, { recursive: true });
    mkdirSync(fixture);
    mkdirSync(mockBin);

    const apkName = "zowl-android-1.0.0-arm64.apk";
    const apk = Buffer.from("signed-apk-fixture");
    const digest = createHash("sha256").update(apk).digest("hex");
    writeFileSync(path.join(fixture, apkName), apk);
    writeFileSync(
      path.join(fixture, "release.json"),
      `${JSON.stringify(
        {
          version: "1.0.0",
          versionCode: 1,
          fileName: apkName,
          sizeBytes: apk.length,
          sha256: digest,
          minAndroid: "Android 7.0+",
          architectures: ["arm64-v8a"],
          publishedAt: "2026-07-29T00:00:00.000Z",
        },
        null,
        2,
      )}\n`,
    );
    const archiveName = "android-release.tar.gz";
    execFileSync("tar", [
      "-C",
      fixture,
      "-czf",
      path.join(incoming, archiveName),
      "release.json",
      apkName,
    ]);
    writeFileSync(path.join(mockBin, "chown"), "#!/bin/sh\nexit 0\n");
    writeFileSync(
      path.join(mockBin, "sha256sum"),
      `#!/bin/sh\nprintf '%s  %s\\n' '${digest}' "$1"\n`,
    );
    chmodSync(path.join(mockBin, "chown"), 0o755);
    chmodSync(path.join(mockBin, "sha256sum"), 0o755);

    execFileSync(
      "sh",
      [
        path.join(repositoryRoot, ".tailstack/hooks/publish-android.sh"),
        ".tailstack/zowl",
        archiveName,
      ],
      {
        env: {
          ...process.env,
          HOME: root,
          PATH: `${mockBin}:${process.env.PATH ?? ""}`,
        },
        input: "",
      },
    );

    const releaseRoot = path.join(
      remoteRoot,
      "shared/runtime/releases/android",
    );
    expect(readFileSync(path.join(releaseRoot, apkName))).toEqual(apk);
    expect(
      JSON.parse(readFileSync(path.join(releaseRoot, "release.json"), "utf8")),
    ).toMatchObject({ fileName: apkName, sha256: digest });
  });
});
