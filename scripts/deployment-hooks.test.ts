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
import { execFileSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const temporaryRoots: string[] = [];

function createHarness() {
  const root = mkdtempSync(path.join(os.tmpdir(), "zemoney-deployment-hooks-"));
  const bin = path.join(root, "bin");
  const chownLog = path.join(root, "chown.log");
  const tailscaleLog = path.join(root, "tailscale.log");
  mkdirSync(bin);
  writeFileSync(chownLog, "");
  writeFileSync(tailscaleLog, "");
  temporaryRoots.push(root);

  writeFileSync(
    path.join(bin, "chown"),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CHOWN_LOG"\n',
  );
  writeFileSync(
    path.join(bin, "tailscale"),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$TAILSCALE_LOG"\n',
  );
  writeFileSync(
    path.join(bin, "docker"),
    `#!/bin/sh
if [ "\${1:-}" = "compose" ] && [ "\${4:-}" = "port" ]; then
  printf '%s\\n' '127.0.0.1:3000'
fi
`,
  );
  for (const command of ["chown", "tailscale", "docker"]) {
    chmodSync(path.join(bin, command), 0o755);
  }

  return {
    root,
    chownLog,
    tailscaleLog,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      CHOWN_LOG: chownLog,
      TAILSCALE_LOG: tailscaleLog,
    },
  };
}

function runReleaseDeploy(
  harness: ReturnType<typeof createHarness>,
  environment: string,
) {
  const release = path.join(harness.root, "release");
  const shared = path.join(harness.root, "shared");
  const backups = path.join(harness.root, "backups");
  mkdirSync(release);
  mkdirSync(shared);
  mkdirSync(backups);
  writeFileSync(
    path.join(release, ".env.docker.example"),
    readFileSync(path.join(repositoryRoot, ".env.docker.example")),
  );
  writeFileSync(path.join(shared, ".env"), environment);

  execFileSync(
    "sh",
    [path.join(repositoryRoot, ".tailstack/hooks/release.sh")],
    {
      env: {
        ...harness.env,
        TAILSTACK_ACTION: "deploy",
        TAILSTACK_RELEASE_ID: "test-release",
        TAILSTACK_RELEASE_DIR: release,
        TAILSTACK_ENV_FILE: path.join(shared, ".env"),
        TAILSTACK_BACKUP_DIR: backups,
        TAILSTACK_IMAGE: "zemoney-app:test-release",
      },
      stdio: "pipe",
    },
  );

  return readFileSync(harness.tailscaleLog, "utf8");
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Tailstack deployment hooks", () => {
  it("assigns first-run writable directories to the non-root app user", () => {
    const harness = createHarness();
    const shared = path.join(harness.root, "shared");
    const environmentFile = path.join(shared, ".env");
    mkdirSync(shared);

    execFileSync(
      "sh",
      [path.join(repositoryRoot, ".tailstack/hooks/configure.sh")],
      {
        env: {
          ...harness.env,
          TAILSTACK_ENV_FILE: environmentFile,
          TAILSTACK_ENV_TEMPLATE: path.join(
            repositoryRoot,
            ".env.docker.example",
          ),
          TAILSTACK_TAILSCALE_IP: "100.64.0.20",
        },
      },
    );

    const ownershipCommands = readFileSync(harness.chownLog, "utf8");
    expect(ownershipCommands).toContain(
      `-R 1000:1000 ${path.join(shared, "runtime/data")} ${path.join(
        shared,
        "runtime/storage",
      )}`,
    );
    expect(ownershipCommands).toContain(path.join(shared, "secrets"));
    expect(ownershipCommands).toContain(
      path.join(shared, "runtime/releases/android"),
    );
    expect(readFileSync(environmentFile, "utf8")).toContain(
      `ZEMONEY_SECRETS_DIR=${path.join(shared, "secrets")}`,
    );
    expect(readFileSync(environmentFile, "utf8")).toContain(
      "PUBLIC_BASE_URL=https://money.example.com",
    );
  });

  it("repairs writable directory ownership before every release", () => {
    const harness = createHarness();
    const release = path.join(harness.root, "release");
    const shared = path.join(harness.root, "shared");
    const backups = path.join(harness.root, "backups");
    mkdirSync(release);
    mkdirSync(shared);
    mkdirSync(backups);
    writeFileSync(
      path.join(release, ".env.docker.example"),
      readFileSync(path.join(repositoryRoot, ".env.docker.example")),
    );
    writeFileSync(
      path.join(shared, ".env"),
      "PUBLIC_BASE_URL=https://ledger.example.net\n",
    );

    execFileSync(
      "sh",
      [path.join(repositoryRoot, ".tailstack/hooks/release.sh")],
      {
        env: {
          ...harness.env,
          TAILSTACK_ACTION: "deploy",
          TAILSTACK_RELEASE_ID: "test-release",
          TAILSTACK_RELEASE_DIR: release,
          TAILSTACK_ENV_FILE: path.join(shared, ".env"),
          TAILSTACK_BACKUP_DIR: backups,
          TAILSTACK_IMAGE: "zemoney-app:test-release",
        },
      },
    );

    const ownershipCommands = readFileSync(harness.chownLog, "utf8");
    expect(ownershipCommands).toContain(
      `-R 1000:1000 ${path.join(shared, "runtime/data")} ${path.join(
        shared,
        "runtime/storage",
      )}`,
    );
    expect(ownershipCommands).toContain(path.join(shared, "secrets"));
    expect(ownershipCommands).toContain(
      path.join(shared, "runtime/releases/android"),
    );
    expect(readFileSync(path.join(shared, ".env"), "utf8")).toContain(
      `ZEMONEY_SECRETS_DIR=${path.join(shared, "secrets")}`,
    );
    expect(readFileSync(path.join(shared, ".env"), "utf8")).toContain(
      "PUBLIC_BASE_URL=https://ledger.example.net\n",
    );
  });

  it("derives the Traefik host from the host's own public URL", () => {
    const harness = createHarness();
    runReleaseDeploy(
      harness,
      "PUBLIC_BASE_URL=https://ledger.example.net:8443/\nZEMONEY_HOST=money.example.com\n",
    );

    const environment = readFileSync(
      path.join(harness.root, "shared/.env"),
      "utf8",
    );
    expect(environment).toContain("ZEMONEY_HOST=ledger.example.net\n");
    expect(environment).not.toContain("ZEMONEY_HOST=money.example.com");
    expect(environment).toContain(
      "PUBLIC_BASE_URL=https://ledger.example.net:8443/\n",
    );
  });

  it("keeps an explicitly configured Traefik host", () => {
    const harness = createHarness();
    runReleaseDeploy(
      harness,
      "PUBLIC_BASE_URL=https://ledger.example.net\nZEMONEY_HOST=internal.example.net\n",
    );

    expect(
      readFileSync(path.join(harness.root, "shared/.env"), "utf8"),
    ).toContain("ZEMONEY_HOST=internal.example.net\n");
  });

  it.each([
    ["missing", "ZEMONEY_HOST=ledger.example.net\n"],
    ["plain HTTP", "PUBLIC_BASE_URL=http://ledger.example.net\n"],
    ["the example value", "PUBLIC_BASE_URL=https://money.example.com\n"],
  ])("refuses to deploy with a %s public URL", (_label, environment) => {
    const harness = createHarness();
    expect(() => runReleaseDeploy(harness, environment)).toThrow();
    expect(readFileSync(harness.tailscaleLog, "utf8")).toBe("");
  });

  it("routes the configured hostname through the shared Traefik network", () => {
    const compose = readFileSync(
      path.join(repositoryRoot, "compose.yml"),
      "utf8",
    );

    expect(compose).toContain(
      'traefik.http.routers.zemoney.rule: "Host(`${ZEMONEY_HOST:?Set ZEMONEY_HOST to the public host name}`)"',
    );
    expect(compose).toContain(
      'traefik.http.services.zemoney.loadbalancer.server.port: "3000"',
    );
    expect(compose).toContain(
      'traefik.docker.network: "${ZEMONEY_TRAEFIK_NETWORK:-traefik-proxy}"',
    );
    expect(compose).toContain(
      'traefik.http.routers.zemoney.entrypoints: "${ZEMONEY_TRAEFIK_ENTRYPOINT:-web}"',
    );
    expect(compose).toMatch(
      /networks:\n\s+traefik-proxy:\n\s+external: true\n\s+name: \$\{ZEMONEY_TRAEFIK_NETWORK:-traefik-proxy\}/u,
    );
  });

  it("publishes the tailnet health endpoint on HTTPS 443 by default", () => {
    const tailscaleCalls = runReleaseDeploy(
      createHarness(),
      "PUBLIC_BASE_URL=https://ledger.example.net\n",
    );

    expect(tailscaleCalls).toContain(
      "serve --bg --yes --https=443 http://127.0.0.1:3000",
    );
  });

  it("publishes the tailnet health endpoint on a configured HTTPS port", () => {
    const tailscaleCalls = runReleaseDeploy(
      createHarness(),
      "PUBLIC_BASE_URL=https://ledger.example.net\nZEMONEY_TAILSCALE_SERVE_HTTPS_PORT=8443\n",
    );

    expect(tailscaleCalls).toContain(
      "serve --bg --yes --https=8443 http://127.0.0.1:3000",
    );
    expect(tailscaleCalls).not.toContain("--https=443 ");
  });

  it("leaves Tailscale Serve untouched when the endpoint is off", () => {
    const tailscaleCalls = runReleaseDeploy(
      createHarness(),
      "PUBLIC_BASE_URL=https://ledger.example.net\nZEMONEY_TAILSCALE_SERVE_HTTPS_PORT=off\n",
    );

    expect(tailscaleCalls).not.toContain("serve");
  });

  it("rejects an invalid Tailscale Serve port before publishing", () => {
    expect(() =>
      runReleaseDeploy(
        createHarness(),
        "PUBLIC_BASE_URL=https://ledger.example.net\nZEMONEY_TAILSCALE_SERVE_HTTPS_PORT=44x\n",
      ),
    ).toThrow();
  });
});
