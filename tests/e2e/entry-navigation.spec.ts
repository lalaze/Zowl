import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("e2e@zemoney.local");
  await page.getByLabel("Password", { exact: true }).fill("zemoney-e2e-password");
  await page.getByRole("button", { name: "Open Zowl" }).click();
  await expect(page).toHaveURL(/\/$/u);
}

for (const [label, destination] of [
  ["Recognize screenshots", "/imports/screenshots"],
  ["Import & history", "/imports"],
]) {
  test(`protects unfinished manual entry before opening ${label}`, async ({ page }) => {
    await login(page);
    await page.goto("/transactions/new");
    await page.getByLabel("Amount").fill("23.45");
    let prompts = 0;
    page.once("dialog", async (dialog) => {
      prompts += 1;
      expect(dialog.message()).toBe("Discard unfinished changes?");
      await dialog.dismiss();
    });
    await page.getByRole("link", { name: label }).click();
    expect(prompts).toBe(1);
    await expect(page).toHaveURL(/\/transactions\/new$/u);
    await expect(page.getByLabel("Amount")).toHaveValue("23.45");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL((url) => url.pathname === destination);

    await page.goto("/transactions/new");
    page.once("dialog", async (dialog) => {
      prompts += 1;
      await dialog.dismiss();
    });
    await page.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL((url) => url.pathname === destination);
    expect(prompts).toBe(1);
  });
}
