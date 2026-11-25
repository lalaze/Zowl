import { expect, test } from "@playwright/test";

async function chooseLanguage(
  page: import("@playwright/test").Page,
  current: RegExp,
  name: "中文" | "English" | "Follow browser" | "跟随浏览器",
) {
  await page.getByRole("button", { name: current }).click();
  await page.getByRole("menuitemradio", { name }).click();
}

async function savedLanguage(page: import("@playwright/test").Page) {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === "zemoney-locale")?.value ?? null;
}

test("an English browser gets English and a saved choice switches everything", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");

  await chooseLanguage(page, /^Language:/u, "中文");
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  expect(await savedLanguage(page)).toBe("zh");

  await page.getByRole("button", { name: "进入 Zowl" }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole("link", { name: "明细" }).first()).toBeVisible();

  await page.goto("/settings");
  await page
    .getByRole("region", { name: "语言" })
    .getByRole("button", { name: "跟随浏览器" })
    .click();
  await expect(
    page.getByRole("region", { name: "Language" }).getByRole("button", {
      name: "Follow browser",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await savedLanguage(page)).toBeNull();
});

test.describe("a Chinese browser", () => {
  test.use({ locale: "zh-CN" });

  test("defaults to Chinese until English is chosen", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
    await expect(page).toHaveTitle(/登录/u);

    await chooseLanguage(page, /^语言：/u, "English");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(await savedLanguage(page)).toBe("en");
  });
});

test("built-in categories take the names of the chosen language and back", async ({
  page,
}) => {
  await page.goto("/login");
  await chooseLanguage(page, /^Language:/u, "中文");
  await page.getByRole("button", { name: "进入 Zowl" }).click();
  await expect(page).toHaveURL(/\/$/u);

  await page.goto("/categories");
  const chineseNotice = page.getByRole("region", { name: "内置分类名称" });
  await expect(chineseNotice).toContainText("还在使用英文名称");
  await chineseNotice.getByRole("button", { name: "改为中文名称" }).click();
  await expect(page.getByText(/已将 \d+ 个内置分类改为中文名称/u)).toBeVisible();
  await expect(chineseNotice).toBeHidden();
  await expect(page.getByText("餐饮", { exact: true }).first()).toBeVisible();

  // Restore the English names the other specs rely on.
  await page.goto("/settings");
  await page.getByRole("region", { name: "语言" }).getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("region", { name: "Language" })).toBeVisible();
  await page.goto("/categories");
  const englishNotice = page.getByRole("region", { name: "Built-in category names" });
  await englishNotice.getByRole("button", { name: "Use English names" }).click();
  await expect(page.getByText(/Renamed \d+ built-in categories to English/u)).toBeVisible();
  await expect(page.getByText("Food", { exact: true }).first()).toBeVisible();
});

test("API errors follow Accept-Language", async ({ request }) => {
  const response = await request.post("/api/auth/login", {
    data: { email: "nobody@zemoney.local", password: "wrong-password" },
    headers: { "accept-language": "zh-CN,zh;q=0.9" },
  });
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.error.code).toBe("INVALID_CREDENTIALS");
  expect(body.error.message).toBe("邮箱或密码不正确");
});
