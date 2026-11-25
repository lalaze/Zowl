import "dotenv/config";

import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { androidReleaseManifestSchema } from "../src/services/android-release-service";

type RunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  capture?: boolean;
};

export type RunCommand = (
  command: string,
  args: string[],
  options?: RunOptions,
) => string;

type DeployDependencies = {
  repositoryRoot?: string;
  run?: RunCommand;
  makeTemporaryDirectory?: () => string;
  verifyPublishedRelease?: (url: string) => Promise<void>;
};

const remoteProjectDirectory = ".tailstack/zemoney";

// Prints PUBLIC_BASE_URL from the host's shared .env, the single source of truth
// for the public URL (the Tailstack release hook validates the same value).
const readPublicBaseUrlScript = `awk -F= '$1 == "PUBLIC_BASE_URL" { sub(/^[^=]*=/, ""); print; exit }' "$1/shared/.env"
`;

function parsePublicBaseUrl(value: string, source: string) {
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`PUBLIC_BASE_URL is missing or invalid in ${source}`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`PUBLIC_BASE_URL in ${source} must use HTTPS`);
  }
  return `${url.origin}${url.pathname.replace(/\/+$/u, "")}`;
}

function defaultRun(command: string, args: string[], options: RunOptions = {}) {
  const capture = options.capture ?? false;
  const hasInput = options.input !== undefined;
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    input: options.input,
    maxBuffer: 128 * 1024 * 1024,
    stdio: capture
      ? "pipe"
      : hasInput
        ? ["pipe", "inherit", "inherit"]
        : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(
      `${command} ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`,
    );
  }
  return typeof result.stdout === "string" ? result.stdout : "";
}

function validateSshTarget(target: string) {
  if (!/^[A-Za-z0-9_.@:-]+$/u.test(target)) {
    throw new Error(`Unsafe SSH target: ${target}`);
  }
}

function sshOptions(environment: NodeJS.ProcessEnv) {
  const port = environment.TAILSTACK_SSH_PORT?.trim();
  const identity = environment.TAILSTACK_SSH_IDENTITY_FILE?.trim();
  if (port && !/^\d+$/u.test(port)) {
    throw new Error("TAILSTACK_SSH_PORT must be numeric");
  }
  return {
    ssh: [
      ...(identity ? ["-i", identity] : []),
      ...(port ? ["-p", port] : []),
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
    ],
    scp: [
      ...(identity ? ["-i", identity] : []),
      ...(port ? ["-P", port] : []),
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
    ],
  };
}

async function defaultVerifyPublishedRelease(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Range: "bytes=0-0" },
  });
  if (response.status !== 206) {
    await response.body?.cancel();
    throw new Error(
      `Published Android release check returned HTTP ${response.status}`,
    );
  }
  await response.body?.cancel();
}

export async function deployProduction(
  arguments_: string[],
  dependencies: DeployDependencies = {},
) {
  const repositoryRoot =
    dependencies.repositoryRoot ?? path.resolve(import.meta.dirname, "..");
  const run = dependencies.run ?? defaultRun;
  const makeTemporaryDirectory =
    dependencies.makeTemporaryDirectory ??
    (() => mkdtempSync(path.join(os.tmpdir(), "zemoney-release-")));
  const verifyPublishedRelease =
    dependencies.verifyPublishedRelease ?? defaultVerifyPublishedRelease;
  const target = arguments_[0] || process.env.TAILSTACK_SSH_TARGET?.trim();
  if (!target) {
    throw new Error(
      "Usage: npm run deploy:production -- <ssh-target> [git-ref] (or set TAILSTACK_SSH_TARGET)",
    );
  }
  const gitReference = arguments_[1] ?? "HEAD";
  validateSshTarget(target);
  const options = sshOptions(process.env);

  const commit = run(
    "git",
    ["rev-parse", "--verify", `${gitReference}^{commit}`, "--"],
    { cwd: repositoryRoot, capture: true },
  ).trim();
  const head = run("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    capture: true,
  }).trim();
  if (!/^[a-f0-9]{40}$/u.test(commit) || commit !== head) {
    throw new Error(
      "Production deployment must build the clean, currently checked-out HEAD",
    );
  }
  const trackedChanges = run(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { cwd: repositoryRoot, capture: true },
  );
  if (trackedChanges.trim()) {
    throw new Error("Production deployment requires a clean tracked worktree");
  }

  const publicBaseUrl = parsePublicBaseUrl(
    run(
      "ssh",
      [...options.ssh, target, "sh", "-s", "--", remoteProjectDirectory],
      { cwd: repositoryRoot, input: readPublicBaseUrlScript, capture: true },
    ),
    `${target}:${remoteProjectDirectory}/shared/.env`,
  );

  const temporaryDirectory = makeTemporaryDirectory();
  mkdirSync(temporaryDirectory, { recursive: true });
  try {
    run("npm", ["run", "mobile:release"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        API_BASE_URL: publicBaseUrl,
        ANDROID_RELEASE_OUTPUT: temporaryDirectory,
      },
    });

    const manifest = androidReleaseManifestSchema.parse(
      JSON.parse(
        readFileSync(path.join(temporaryDirectory, "release.json"), "utf8"),
      ),
    );
    if (path.basename(manifest.fileName) !== manifest.fileName) {
      throw new Error("Android release manifest contains an unsafe file name");
    }
    readFileSync(path.join(temporaryDirectory, manifest.fileName));

    const shortCommit = commit.slice(0, 12);
    const archiveName = `zowl-android-${shortCommit}-${process.pid}.tar.gz`;
    const archivePath = path.join(temporaryDirectory, archiveName);
    run(
      "tar",
      [
        "-C",
        temporaryDirectory,
        "-czf",
        archivePath,
        "release.json",
        manifest.fileName,
      ],
      { cwd: repositoryRoot },
    );

    run("tailstack", ["deploy", target, commit], { cwd: repositoryRoot });

    run(
      "scp",
      [
        ...options.scp,
        archivePath,
        `${target}:${remoteProjectDirectory}/incoming/${archiveName}`,
      ],
      { cwd: repositoryRoot },
    );
    const publishScript = readFileSync(
      path.join(repositoryRoot, ".tailstack/hooks/publish-android.sh"),
      "utf8",
    );
    run(
      "ssh",
      [
        ...options.ssh,
        target,
        "sh",
        "-s",
        "--",
        remoteProjectDirectory,
        archiveName,
      ],
      { cwd: repositoryRoot, input: publishScript },
    );

    const downloadUrl = `${publicBaseUrl}/downloads/android/latest`;
    await verifyPublishedRelease(downloadUrl);
    console.log(
      `Production Web and Android release completed for ${shortCommit}.`,
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  deployProduction(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Deployment failed");
    process.exitCode = 1;
  });
}
