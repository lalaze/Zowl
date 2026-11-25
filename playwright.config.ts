import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;
const serverEnvironment = { ...process.env };
delete serverEnvironment.NO_COLOR;
const appServerCommand =
  process.env.E2E_USE_PRODUCTION_SERVER === "1"
    ? "npm run e2e:prepare && npm run db:setup && npm run start -- --hostname 0.0.0.0 --port 3100"
    : "npm run e2e:prepare && npm run db:setup && npm run dev -- --hostname 0.0.0.0 --port 3100";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  // Cold development routes can spend more than five seconds compiling before
  // handling a request. Keep production assertions at their normal budget.
  expect: { timeout: process.env.E2E_USE_PRODUCTION_SERVER === "1" ? 5_000 : 15_000 },
  // The serial flow intentionally shares one private ledger; retrying a single
  // mutating step against that ledger would make the result non-deterministic.
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: [
    {
      command: "npx tsx scripts/ai-categorization-e2e-server.ts",
      url: "http://127.0.0.1:4318/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: appServerCommand,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...serverEnvironment,
        DATABASE_URL: ".data/zemoney-e2e.sqlite",
        FILE_STORAGE_ROOT: "storage/e2e",
        DEMO_EMAIL: "e2e@zemoney.local",
        DEMO_PASSWORD: "zemoney-e2e-password",
        RECEIPT_RECOGNITION_PROVIDER: "mock",
        AI_CATEGORIZATION_PROVIDER: "off",
        AI_CATEGORIZATION_ENCRYPTION_KEY:
          "CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk=",
      },
    },
  ],
});
