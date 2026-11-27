import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

test("review inbox checks batch versions, posts once and exposes completed activity", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/login");
  await page.getByLabel("Email").fill("e2e@zowl.local");
  await page.getByLabel("Password", { exact: true }).fill("zowl-e2e-password");
  await page.getByRole("button", { name: "Open Zowl" }).click();
  await expect(page).toHaveURL(/\/$/);
  const ingested = await page.request.post("/api/captures/notifications", {
    data: { events: [1, 2].map((number) => ({
      idempotencyKey: randomBytes(32).toString("hex"),
      evidenceDigest: randomBytes(32).toString("hex"),
      platform: "alipay", sourcePackage: "com.eg.android.AlipayGphone",
      parserId: "alipay-payment-success", parserVersion: 1,
      postedAt: "2026-09-23T12:00:00.000Z", confidenceBasisPoints: 9500,
      facts: { amountMinor: 2311 + number, merchantName: `Inbox verification ${number}` },
    })) },
  });
  expect(ingested.ok()).toBe(true);
  const pending = await page.request.get("/api/captures/notifications");
  const selected = (await pending.json()).data.items.filter((item: { merchantName: string }) => item.merchantName?.startsWith("Inbox verification"));
  expect(selected).toHaveLength(2);
  const stale = await page.request.post("/api/captures/notifications/confirm", {
    data: { items: selected.map((item: { id: string; confirmationVersion: number }) => ({ id: item.id, version: item.confirmationVersion + 1 })) },
  });
  expect(stale.status()).toBe(409);
  const untrusted = await page.request.post("/api/captures/notifications/confirm", {
    headers: { origin: "https://untrusted.example" }, data: { items: [] },
  });
  expect(untrusted.status()).toBe(403);
  await page.goto("/imports/notifications");
  for (const checkbox of await page.getByLabel("Select for batch review").all()) await checkbox.check();
  await page.getByRole("button", { name: "Review 2 selected" }).click();
  await expect(page.getByRole("region", { name: "Confirm reviewed transactions" })).toContainText("Inbox verification 1");
  await page.getByRole("button", { name: "Confirm and post", exact: true }).click();
  await expect(page.getByText("No pending payment notifications.")).toBeVisible();
  const replay = await page.request.post("/api/captures/notifications/confirm", {
    data: { items: selected.map((item: { id: string; confirmationVersion: number }) => ({ id: item.id, version: item.confirmationVersion })) },
  });
  expect(replay.status()).toBe(200);
  await page.getByRole("button", { name: "Recently processed" }).click();
  await expect(page.getByRole("link", { name: "View, amend or void transaction" })).toHaveCount(2);
});
