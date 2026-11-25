import { expect, test } from "@playwright/test";

async function chooseTheme(
  page: import("@playwright/test").Page,
  name: "Light" | "Dark" | "Follow system",
) {
  await page.getByRole("button", { name: /^Theme:/u }).click();
  await page.getByRole("menuitemradio", { name }).click();
}

async function chooseAccent(
  page: import("@playwright/test").Page,
  name: "Amber" | "Night owl" | "Forest" | "Berry",
) {
  await page.getByRole("button", { name: /^Theme:/u }).click();
  await page.getByRole("menuitemradio", { name }).click();
}

// Product decision: a fresh browser follows the system theme, matching
// the Flutter app's ThemeMode.system default.
test("defaults to the system theme on a fresh browser", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");

  await expect(page.locator("html")).toHaveClass(/\bdark\b/u);
  await expect(
    page.getByRole("button", { name: "Theme: Follow system (currently dark)" }),
  ).toBeVisible();
  await expect(
    page.evaluate(() => localStorage.getItem("zemoney-theme")),
  ).resolves.toBeNull();
});

test("persists manual overrides and resumes following the system", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");

  await chooseTheme(page, "Dark");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/u);
  expect(
    await page.evaluate(() => localStorage.getItem("zemoney-theme")),
  ).toBe("dark");

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/u);
  await page.getByRole("button", { name: "Open Zowl" }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.locator("html")).toHaveClass(/\bdark\b/u);

  await chooseTheme(page, "Follow system");
  await expect(page.locator("html")).toHaveClass(/\blight\b/u);
  expect(
    await page.evaluate(() => localStorage.getItem("zemoney-theme")),
  ).toBe("system");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/\bdark\b/u);
});

test("switches and persists the accent color independently", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");

  const primary = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--primary")
        .trim(),
    );

  await expect(page.locator("html")).toHaveAttribute("data-accent", "amber");
  expect(await primary()).toBe("#f2b33d");
  await chooseAccent(page, "Night owl");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "night");
  expect(
    await page.evaluate(() => localStorage.getItem("zemoney-accent")),
  ).toBe("night");
  expect(await primary()).toBe("#3d4a8f");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "night");
  await page.getByRole("button", { name: "Open Zowl" }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.locator("html")).toHaveAttribute("data-accent", "night");

  await chooseAccent(page, "Amber");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "amber");
  expect(await primary()).toBe("#f2b33d");
  expect(
    await page.evaluate(() => localStorage.getItem("zemoney-accent")),
  ).toBe("amber");
});

test("migrates an accent saved by the previous design", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => localStorage.setItem("zemoney-accent", "emerald"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "forest");
  expect(
    await page.evaluate(() => localStorage.getItem("zemoney-accent")),
  ).toBe("forest");
});

test("manages nickname and appearance from settings", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Open Zowl" }).click();
  await expect(page).toHaveURL(/\/$/u);
  await page.goto("/settings");

  const nickname = page.getByRole("textbox", { name: "Nickname" });
  await expect(nickname).toHaveValue("Ze");
  await nickname.fill("Acceptance nickname");
  await page.getByRole("button", { name: "Save nickname" }).click();
  await expect(page.getByText("Nickname updated")).toBeVisible({ timeout: 30_000 });
  await expect(nickname).toHaveValue("Acceptance nickname");

  await page
    .getByRole("button", { name: "Change avatar, current: Piggy bank" })
    .click();
  await page.getByRole("menuitemradio", { name: "Cat" }).click();
  await expect(
    page.getByRole("button", { name: "Change avatar, current: Cat" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/u);
  expect(
    await page.evaluate(() => localStorage.getItem("zemoney-theme")),
  ).toBe("dark");

  await page.getByRole("button", { name: "Theme color: Berry" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "berry");
  expect(
    await page.evaluate(() => localStorage.getItem("zemoney-accent")),
  ).toBe("berry");
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/u);
  await expect(page.locator("html")).toHaveAttribute("data-accent", "berry");
  await expect(nickname).toHaveValue("Acceptance nickname");
  await expect(
    page.getByRole("button", { name: "Change avatar, current: Cat" }),
  ).toBeVisible();

  await nickname.fill("Ze");
  await page.getByRole("button", { name: "Save nickname" }).click();
  await expect(page.getByText("Nickname updated")).toBeVisible();
  await page
    .getByRole("button", { name: "Change avatar, current: Cat" })
    .click();
  await page.getByRole("menuitemradio", { name: "Piggy bank" }).click();
  await expect(
    page.getByRole("button", { name: "Change avatar, current: Piggy bank" }),
  ).toBeVisible();
});
