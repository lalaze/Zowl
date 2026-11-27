import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type MobilePlatform = "android" | "ios";

const root = process.cwd();
const artifactRoot = resolve(root, ".artifacts/mobile-e2e");
const bundleId = "com.zowl.mobile";
const scenarios = [
  "auth_navigation",
  "ledger_lifecycle",
  "screenshot_review",
  "statistics_settings",
] as const;
type Scenario = (typeof scenarios)[number];
const requestedScenario = process.argv[3];
const selectedScenarios: readonly Scenario[] = requestedScenario
  ? scenarios.includes(requestedScenario as Scenario)
    ? [requestedScenario as Scenario]
    : []
  : scenarios;

function environmentFor(platform: MobilePlatform) {
  return {
    ...process.env,
    NEXT_DIST_DIR: `.next-mobile-e2e-${platform}`,
    NEXT_E2E_SKIP_BUILD_TYPECHECK: "1",
    DATABASE_URL: `.data/zowl-mobile-e2e-${platform}.sqlite`,
    FILE_STORAGE_ROOT: `storage/mobile-e2e-${platform}`,
    DEMO_EMAIL: `mobile-${platform}@zowl.local`,
    DEMO_PASSWORD: `zowl-mobile-${platform}`,
    RECEIPT_RECOGNITION_PROVIDER: "mock",
    AI_CATEGORIZATION_PROVIDER: "off",
    AI_CATEGORIZATION_ENCRYPTION_KEY:
      "CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk=",
  };
}

async function clearPlatformData(platform: MobilePlatform) {
  const database = resolve(root, `.data/zowl-mobile-e2e-${platform}.sqlite`);
  for (const path of [database, `${database}-shm`, `${database}-wal`]) {
    await rm(path, { force: true });
  }
  await rm(resolve(root, `storage/mobile-e2e-${platform}`), {
    recursive: true,
    force: true,
  });
  await rm(resolve(root, `.next-mobile-e2e-${platform}`), {
    recursive: true,
    force: true,
  });
}

async function runLogged(
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; logPath: string; cwd?: string },
) {
  const log = createWriteStream(options.logPath, { flags: "w" });
  const child = spawn(command, args, {
    cwd: options.cwd ?? root,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
    log.write(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
    log.write(chunk);
  });
  const status = await new Promise<number>((resolveStatus, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolveStatus(code ?? 1));
  });
  await new Promise<void>((done) => log.end(done));
  if (status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${status}`);
  }
}

async function waitForServer(server: ChildProcess, port: number) {
  let startupError: Error | undefined;
  const captureStartupError = (error: Error) => {
    startupError = error;
  };
  server.once("error", captureStartupError);
  try {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      if (startupError) throw startupError;
      if (server.exitCode !== null) {
        throw new Error(
          `Backend exited before becoming ready (${server.exitCode})`,
        );
      }
      try {
        await fetch(`http://127.0.0.1:${port}/api/auth/session`);
        return;
      } catch {
        await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      }
    }
    throw new Error("Backend did not become ready within 90 seconds");
  } finally {
    server.off("error", captureStartupError);
  }
}

async function startBackend(
  platform: MobilePlatform,
  env: NodeJS.ProcessEnv,
  port: number,
) {
  const log = createWriteStream(
    resolve(artifactRoot, platform, "backend.log"),
    { flags: "w" },
  );
  const child = spawn(
    "npm",
    ["run", "start", "--", "--hostname", "0.0.0.0", "--port", String(port)],
    {
      cwd: root,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", (chunk: Buffer) => log.write(chunk));
  child.stderr?.on("data", (chunk: Buffer) => log.write(chunk));
  try {
    await waitForServer(child, port);
    return { child, log };
  } catch (error) {
    await stopBackend(child, log);
    throw error;
  }
}

async function stopBackend(
  child: ChildProcess,
  log: ReturnType<typeof createWriteStream>,
) {
  if (child.pid && child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    await Promise.race([
      new Promise<void>((resolveExit) =>
        child.once("exit", () => resolveExit()),
      ),
      new Promise<void>((resolveWait) => setTimeout(resolveWait, 5_000)),
    ]);
    if (child.exitCode === null) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
  }
  log.end();
}

function androidDevice() {
  const requested = process.env.MOBILE_E2E_ANDROID_DEVICE;
  const output = spawnSync("adb", ["devices"], { encoding: "utf8" });
  if (output.status !== 0) throw new Error("adb devices failed");
  const connected = output.stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/u))
    .filter((parts) => parts[0] && parts[1] === "device")
    .map((parts) => parts[0]!);
  const device =
    requested ?? connected.find((value) => value.startsWith("emulator-"));
  if (!device || !connected.includes(device)) {
    throw new Error("No connected Android emulator is available");
  }
  const sdk = spawnSync(
    "adb",
    ["-s", device, "shell", "getprop", "ro.build.version.sdk"],
    { encoding: "utf8" },
  ).stdout.trim();
  if (sdk !== "35") {
    throw new Error(
      `Android E2E requires API 35; ${device} reports API ${sdk}`,
    );
  }
  return device;
}

type SimulatorDevice = {
  name: string;
  udid: string;
  state: string;
  isAvailable?: boolean;
};

function iosDevice() {
  if (process.platform !== "darwin") {
    throw new Error("iOS E2E requires macOS and Xcode");
  }
  const requested = process.env.MOBILE_E2E_IOS_DEVICE;
  const result = spawnSync(
    "xcrun",
    ["simctl", "list", "devices", "available", "--json"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error("Unable to list iOS simulators");
  const payload = JSON.parse(result.stdout) as {
    devices: Record<string, SimulatorDevice[]>;
  };
  const devices = Object.entries(payload.devices)
    .sort(([left], [right]) => right.localeCompare(left))
    .flatMap(([, values]) => values)
    .filter(
      (device) =>
        device.isAvailable !== false &&
        device.name.toLowerCase().includes("iphone"),
    );
  const device = requested
    ? devices.find(
        (value) => value.udid === requested || value.name === requested,
      )
    : (devices.find((value) => value.state === "Booted") ?? devices[0]);
  if (!device) throw new Error("No available iPhone simulator was found");
  if (device.state !== "Booted") {
    const boot = spawnSync("xcrun", ["simctl", "boot", device.udid], {
      stdio: "inherit",
    });
    if (boot.status !== 0) throw new Error(`Unable to boot ${device.name}`);
  }
  const ready = spawnSync(
    "xcrun",
    ["simctl", "bootstatus", device.udid, "-b"],
    { stdio: "inherit" },
  );
  if (ready.status !== 0)
    throw new Error(`${device.name} did not finish booting`);
  return device.udid;
}

function resetInstalledApp(platform: MobilePlatform, device: string) {
  if (platform === "android") {
    // Uninstall rather than `pm clear`, so every scenario starts from the same
    // fresh install as the first one: on the CI emulator a debug app launched
    // after `pm clear` failed to connect its VM Service.
    spawnSync("adb", ["-s", device, "uninstall", bundleId], {
      stdio: "ignore",
    });
    // Start each scenario with an empty log so a failure dump is its own.
    spawnSync("adb", ["-s", device, "logcat", "-c"], { stdio: "ignore" });
  } else {
    spawnSync("xcrun", ["simctl", "uninstall", device, bundleId], {
      stdio: "ignore",
    });
  }
}

async function captureFailure(
  platform: MobilePlatform,
  device: string,
  scenario: string,
) {
  const path = resolve(artifactRoot, platform, `${scenario}.png`);
  if (platform === "android") {
    const result = spawnSync(
      "adb",
      ["-s", device, "exec-out", "screencap", "-p"],
      { maxBuffer: 20 * 1024 * 1024 },
    );
    if (result.status === 0 && result.stdout)
      await writeFile(path, result.stdout);
    const logcat = spawnSync("adb", ["-s", device, "logcat", "-d"], {
      maxBuffer: 64 * 1024 * 1024,
    });
    if (logcat.status === 0 && logcat.stdout)
      await writeFile(
        resolve(artifactRoot, platform, `${scenario}.logcat.txt`),
        logcat.stdout,
      );
  } else {
    spawnSync("xcrun", ["simctl", "io", device, "screenshot", path], {
      stdio: "ignore",
    });
  }
}

/// True when a scenario failed before its test body ran: the app was never
/// built, installed or connected (iOS simulators occasionally hang at launch).
async function neverStarted(logPath: string) {
  const log = await readFile(logPath, "utf8").catch(() => "");
  return /\+0 -1: loading [^\n]*\[E\]/u.test(log.replaceAll("\r", "\n"));
}

async function runPlatform(platform: MobilePlatform) {
  const port = 3200;
  const env = environmentFor(platform);
  const device = platform === "android" ? androidDevice() : iosDevice();
  const apiHost = platform === "android" ? "10.0.2.2" : "127.0.0.1";
  const runId = `${platform}-${Date.now()}`;
  const platformArtifacts = resolve(artifactRoot, platform);
  await rm(platformArtifacts, { recursive: true, force: true });
  await mkdir(platformArtifacts, { recursive: true });
  await clearPlatformData(platform);
  await runLogged("npm", ["run", "db:migrate"], {
    env,
    logPath: resolve(artifactRoot, platform, "migrate.log"),
  });
  await runLogged("npm", ["run", "db:seed"], {
    env,
    logPath: resolve(artifactRoot, platform, "seed.log"),
  });
  await runLogged("npm", ["run", "build"], {
    env,
    logPath: resolve(artifactRoot, platform, "build.log"),
  });
  const backend = await startBackend(platform, env, port);
  let completed = false;
  try {
    for (const scenario of selectedScenarios) {
      for (let attempt = 1; ; attempt++) {
        resetInstalledApp(platform, device);
        const logPath = resolve(
          artifactRoot,
          platform,
          attempt === 1 ? `${scenario}.log` : `${scenario}.retry.log`,
        );
        try {
          await runLogged(
            "flutter",
            [
              "test",
              `integration_test/${scenario}_test.dart`,
              "-d",
              device,
              "--timeout=10m",
              `--dart-define=API_BASE_URL=http://${apiHost}:${port}`,
              "--dart-define=ALLOW_INSECURE_LOCAL_API=true",
              `--dart-define=INTEGRATION_EMAIL=${env.DEMO_EMAIL}`,
              `--dart-define=INTEGRATION_PASSWORD=${env.DEMO_PASSWORD}`,
              `--dart-define=INTEGRATION_RUN_ID=${runId}`,
              "--reporter=expanded",
            ],
            { env, logPath, cwd: resolve(root, "mobile") },
          );
          break;
        } catch (error) {
          // Retry once only when the test never started; a failing test body
          // is reported as is.
          if (attempt === 1 && (await neverStarted(logPath))) {
            console.warn(
              `${scenario}: the app never started on ${device}; retrying once.`,
            );
            continue;
          }
          await captureFailure(platform, device, scenario);
          throw error;
        }
      }
    }
    completed = true;
  } finally {
    await stopBackend(backend.child, backend.log);
    if (completed) await clearPlatformData(platform);
  }
}

const requested = process.argv[2];
const platforms: MobilePlatform[] =
  requested === "all"
    ? ["android", "ios"]
    : requested === "android" || requested === "ios"
      ? [requested]
      : [];

if (!platforms.length) {
  throw new Error(
    "Usage: tsx scripts/run-mobile-e2e.ts android|ios|all [scenario]",
  );
}
if (!selectedScenarios.length) {
  throw new Error(`Unknown mobile E2E scenario: ${requestedScenario}`);
}

for (const platform of platforms) await runPlatform(platform);
