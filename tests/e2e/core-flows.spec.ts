import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("e2e@zemoney.local");
  await page.getByLabel("Password", { exact: true }).fill("zemoney-e2e-password");
  await page.getByRole("button", { name: "Open Zowl" }).click();
  await expect(page).toHaveURL(/\/$/u);
}

async function loginWith(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Open Zowl" }).click();
}

async function logout(page: Page) {
  await page.request.post("/api/auth/logout");
  await page.goto("/login");
}

async function authenticatedHeaders(page: Page) {
  const cookies = await page.context().cookies();
  return {
    cookie: cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; "),
  };
}

async function voidTransactions(page: Page, transactionIds: string[]) {
  const headers = await authenticatedHeaders(page);
  for (const [index, transactionId] of transactionIds.entries()) {
    const detailResponse = await page.request.get(
      `/api/transactions/${transactionId}`,
      { headers },
    );
    if (!detailResponse.ok()) continue;
    const detail = (await detailResponse.json()) as {
      data: { currentRevisionId: string };
    };
    await page.request.delete(`/api/transactions/${transactionId}`, {
      headers,
      data: {
        expectedRevisionId: detail.data.currentRevisionId,
        operationId: `e2e-quick-entry-cleanup-${index}`,
      },
    });
  }
}

async function chooseOption(
  page: Page,
  label: string | RegExp,
  option: string | RegExp,
) {
  await page.getByRole("combobox", { name: label }).click();
  await page
    .getByRole("option", {
      name: option,
      exact: typeof option === "string",
    })
    .click();
}

test.describe.serial("core money flows", () => {
  test("administrator manages an isolated member account lifecycle", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const memberEmail = "managed-member@zemoney.local";
    const initialPassword = "managed-member-password";
    const resetPassword = "managed-member-password-reset";

    await login(page);
    await page.goto("/settings");
    await page.getByRole("link", { name: "Manage system accounts" }).click();
    await expect(page).toHaveURL(/\/settings\/admin$/u);

    await page.getByRole("button", { name: "Add account" }).click();
    await page.getByLabel("Login email").fill(memberEmail);
    await page.getByLabel("Nickname (optional)").fill("Managed account");
    await page.getByLabel("Password", { exact: true }).fill(initialPassword);
    await page.getByLabel("Confirm password").fill(initialPassword);
    await page.getByRole("button", { name: "Create account", exact: true }).click();

    const memberCard = page.locator(`[data-account-email="${memberEmail}"]`);
    // dev 模式下首个写请求伴随路由编译，放宽等待时间
    await expect(memberCard).toBeVisible({ timeout: 15_000 });
    await memberCard.getByRole("button", { name: "Change password" }).click();
    const resetDialog = page.getByRole("dialog");
    await resetDialog
      .getByLabel("Current administrator password")
      .fill("zemoney-e2e-password");
    await resetDialog.getByLabel("New password", { exact: true }).fill(resetPassword);
    await resetDialog.getByLabel("Confirm new password").fill(resetPassword);
    await resetDialog.getByRole("button", { name: "Confirm change" }).click();
    await expect(page.getByRole("status")).toContainText("password updated");

    await logout(page);
    await loginWith(page, memberEmail, initialPassword);
    await expect(page.getByText("Incorrect email or password", { exact: true })).toBeVisible();
    await loginWith(page, memberEmail, resetPassword);
    await expect(page).toHaveURL(/\/$/u);
    await page.goto("/settings/admin");
    await expect(page).toHaveURL(/\/settings$/u);

    await logout(page);
    await login(page);
    await page.goto("/settings/admin");
    const activeMemberCard = page.locator(
      `[data-account-email="${memberEmail}"]`,
    );
    page.once("dialog", (dialog) => dialog.accept());
    await activeMemberCard.getByRole("button", { name: "Disable account" }).click();
    await expect(page.getByRole("status")).toContainText("Account disabled", {
      timeout: 15_000,
    });

    await logout(page);
    await loginWith(page, memberEmail, resetPassword);
    await expect(
      page.getByText("Account disabled. Contact the administrator", { exact: true }),
    ).toBeVisible();

    await loginWith(page, "e2e@zemoney.local", "zemoney-e2e-password");
    await expect(page).toHaveURL(/\/$/u);
    await page.goto("/settings/admin");
    const disabledMemberCard = page.locator(
      `[data-account-email="${memberEmail}"]`,
    );
    page.once("dialog", (dialog) => dialog.accept());
    await disabledMemberCard
      .getByRole("button", { name: "Reactivate" })
      .click();
    await expect(page.getByRole("status")).toContainText("Account reactivated");
  });

  test("quickly posts from overview and transactions without leaving the page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);
    const createdTransactionIds: string[] = [];

    try {
      await page.getByRole("button", { name: "Add transaction" }).click();
      const overviewDialog = page.getByRole("dialog", { name: "Quick entry" });
      await expect(overviewDialog).toBeVisible();
      await expect(
        page.getByRole("tab", { name: "Manual entry" }),
      ).toHaveAttribute("aria-selected", "true");
      await page.getByRole("tab", { name: "Automatic screenshot entry" }).click();
      await page.getByLabel("Select a quick-entry screenshot").setInputFiles({
        name: "quick-payment.png",
        mimeType: "image/png",
        buffer: onePixelPng,
      });
      const quickReviewLink = overviewDialog.getByRole("link", { name: "Review", exact: true });
      // dev 模式下识别接口首次编译较慢，放宽等待时间
      await expect(quickReviewLink).toBeVisible({ timeout: 15_000 });
      await expect(quickReviewLink).toHaveAttribute(
        "href",
        /\/imports\/screenshots\/[^/]+\/review/u,
      );

      await page.getByRole("tab", { name: "Manual entry" }).click();
      await expect(page.getByLabel("Amount")).toBeFocused();
      await page.getByLabel("Amount").fill("12.31");
      await page.getByRole("button", { name: "Add more details" }).click();
      await expect(page.getByLabel("Merchant name")).toBeVisible();
      await expect(page.getByLabel("Amount")).toHaveValue("12.31");
      await page.getByRole("tab", { name: "Automatic screenshot entry" }).click();
      await page.getByRole("tab", { name: "Manual entry" }).click();
      await expect(page.getByLabel("Amount")).toHaveValue("12.31");
      await chooseOption(page, "Category", "Food");
      await page.getByRole("button", { name: "Confirm and post" }).click();

      await expect(page).toHaveURL((url) => url.pathname === "/");
      await expect(overviewDialog).toHaveCount(0);
      const overviewStatus = page.getByRole("status");
      await expect(overviewStatus).toContainText("Transaction posted");
      const overviewHref = await overviewStatus
        .getByRole("link", { name: "View details" })
        .getAttribute("href");
      expect(overviewHref).toMatch(/^\/transactions\//u);
      createdTransactionIds.push(overviewHref!.split("/").at(-1)!);
      await expect(page.getByText(/12\.31/u).first()).toBeVisible();

      await page.goto("/transactions");
      await page.getByRole("button", { name: "Add transaction" }).click();
      const transactionsDialog = page.getByRole("dialog", {
        name: "Quick entry",
      });
      await expect(transactionsDialog).toBeVisible();
      await page.getByRole("tab", { name: "Manual entry" }).click();
      await expect(page.getByLabel("Amount")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(transactionsDialog).toHaveCount(0);

      await expect(page.getByRole("button", { name: "Add transaction" })).toBeFocused();
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
      await page.keyboard.press("n");
      await expect(transactionsDialog).toBeVisible();
      await page.getByRole("tab", { name: "Manual entry" }).click();
      await expect(page.getByLabel("Amount")).toBeFocused();
      await page.getByLabel("Amount").fill("17.82");
      await chooseOption(page, "Category", "Food");
      await page.getByRole("button", { name: "Confirm and post" }).click();

      await expect(page).toHaveURL((url) => url.pathname === "/transactions");
      const transactionsStatus = page.getByRole("status");
      await expect(transactionsStatus).toContainText("Transaction posted");
      const transactionsHref = await transactionsStatus
        .getByRole("link", { name: "View details" })
        .getAttribute("href");
      expect(transactionsHref).toMatch(/^\/transactions\//u);
      createdTransactionIds.push(transactionsHref!.split("/").at(-1)!);
      await expect(page.getByText(/17\.82/u).first()).toBeVisible();
    } finally {
      await voidTransactions(page, createdTransactionIds);
    }
  });

  test("creates, displays and voids a manual transaction", async ({ page }) => {
    await login(page);
    await page.goto("/transactions/new");
    await page.getByLabel("Amount").fill("23.45");
    await page.getByRole("button", { name: "Add more details" }).click();
    await page.getByLabel("Merchant name").fill("End-to-end test merchant");
    await chooseOption(page, "Category", "Food");
    await page.getByLabel("Payment method").fill("Test wallet");
    await page.getByLabel("Transaction description").fill("Playwright Manual entry lifecycle");
    await page.getByRole("button", { name: "Confirm and post" }).click();

    await expect(page).toHaveURL(/\/transactions\/[^/]+$/u);
    await expect(page.getByRole("heading", { name: "End-to-end test merchant" })).toBeVisible();
    await expect(page.getByText(/-\s*¥23\.45/u)).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    const voidButton = page.getByRole("button", { name: "Void" });
    await voidButton.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await voidButton.click();
    await expect(page).toHaveURL(/\/transactions$/u);
    await expect(page.getByText("End-to-end test merchant")).toHaveCount(0);
  });

  test("preserves a non-CNY two-decimal currency when editing", async ({
    page,
  }) => {
    await login(page);
    const headers = await authenticatedHeaders(page);
    const createdResponse = await page.request.post("/api/transactions", {
      headers,
      data: {
        type: "expense",
        amount: "10.25",
        currency: "USD",
        merchantName: "USD test merchant",
        description: null,
        categoryId: null,
        transactionTime: "2026-07-15T04:30:00.000Z",
        paymentMethod: null,
        confirmation: { id: "e2e-usd-posting", version: 1 },
      },
    });
    expect(createdResponse.status()).toBe(201);
    const created = (await createdResponse.json()) as {
      data: { id: string; currentRevisionId: string };
    };

    await page.goto(`/transactions/${created.data.id}/edit`);
    await expect(page.getByLabel("Currency")).toHaveValue("USD");
    await expect(page.getByLabel("Amount")).toHaveValue("10.25");
    await page.getByLabel("Transaction description").fill("Preserve USD currency");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/transactions/${created.data.id}$`, "u"));

    const detailResponse = await page.request.get(
      `/api/transactions/${created.data.id}`,
      { headers },
    );
    const detail = (await detailResponse.json()) as {
      data: {
        currency: string;
        amountMinor: number;
        description: string | null;
        currentRevisionId: string;
      };
    };
    expect(detail).toMatchObject({
      data: {
        currency: "USD",
        amountMinor: 1_025,
        description: "Preserve USD currency",
      },
    });
    const voidedResponse = await page.request.delete(
      `/api/transactions/${created.data.id}`,
      {
        headers,
        data: {
          expectedRevisionId: detail.data.currentRevisionId,
          operationId: "e2e-usd-voiding",
        },
      },
    );
    expect(voidedResponse.status()).toBe(200);
  });

  test("imports an Alipay CSV through preview and confirmation", async ({ page }) => {
    await login(page);
    await page.goto("/imports/files");
    await page.locator('input[type="file"]').setInputFiles(
      path.resolve(
        process.cwd(),
        "src/services/import-service/fixtures/alipay.csv",
      ),
    );
    await page.getByRole("button", { name: "Parse and preview" }).click();

    await expect(page).toHaveURL(/\/imports\/files\/[^/]+\/review$/u);
    await expect(page.getByText("Alipay", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Confirm import 2 transactions/u }).click();
    // dev 模式下确认接口首次编译与账本写入较慢，放宽等待时间
    await expect(page).toHaveURL(/\/imports\/files\/[^/]+\/result$/u, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "2 added, 0 enriched" }),
    ).toBeVisible();
  });

  test("surfaces invalid import rows for correction or explicit skipping", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 855, height: 690 });
    await login(page);
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-E2E-INVALID,2026-07-15 10:00:00,Money fund,Demand deposit,100.00,/,Transaction successful",
      "ALI-E2E-INVALID-2,2026-07-15 10:30:00,WeChat savings,Withdrawal,88.00,/,Transaction successful",
      "ALI-E2E-VALID,2026-07-15 11:00:00,Test merchant,Lunch,12.00,Expense,Transaction successful",
    ].join("\n");

    await page.goto("/imports/files");
    await page.locator('input[type="file"]').setInputFiles({
      name: "invalid-row.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await page.getByRole("button", { name: "Parse and preview" }).click();

    await expect(page.getByText("There are 2 parsing errors to resolve")).toBeVisible();
    await page.getByRole("link", { name: "Review each item" }).click();
    await expect(page).toHaveURL(/reviewErrors=1/u);
    const dialog = page.getByRole("dialog", { name: "Row 3 needs attention" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Cannot determine transaction type", { exact: true }),
    ).toBeVisible();
    const heightAnimation = await dialog.evaluate(async (dialogElement) => {
      const manualButton = Array.from(
        dialogElement.querySelectorAll("button"),
      ).find((button) => button.textContent?.includes("Edit manually"));
      if (!manualButton) throw new Error("Manual edit button not found");

      const frames = [dialogElement.getBoundingClientRect().height];
      const startedAt = performance.now();
      manualButton.click();
      while (performance.now() - startedAt < 420) {
        await new Promise(requestAnimationFrame);
        frames.push(dialogElement.getBoundingClientRect().height);
      }
      return frames;
    });
    const initialDialogHeight = heightAnimation[0]!;
    const firstAnimatedHeight = heightAnimation[1]!;
    const finalDialogHeight = heightAnimation.at(-1)!;
    expect(finalDialogHeight - initialDialogHeight).toBeGreaterThan(60);
    expect(firstAnimatedHeight).toBeLessThan(finalDialogHeight - 20);
    const intermediateHeightFrames = heightAnimation.filter(
      (height) =>
        height > initialDialogHeight + 10 && height < finalDialogHeight - 10,
    );
    expect(intermediateHeightFrames.length).toBeGreaterThanOrEqual(3);
    await expect(dialog.locator("select")).toHaveCount(0);
    const typeSelect = dialog.getByRole("combobox", { name: "Transaction type" });
    await typeSelect.click();
    await expect(dialog.getByRole("option", { name: /^Transfer/u })).toBeVisible();
    await dialog.getByRole("option", { name: /^Transfer/u }).click();
    await expect(typeSelect).toContainText("Transfer");
    await dialog.getByRole("button", { name: "Save and recheck" }).click();

    const secondDialog = page.getByRole("dialog", { name: "Row 4 needs attention" });
    await expect(secondDialog).toBeVisible();
    await secondDialog.getByRole("button", { name: "Skip this item" }).click();
    await expect(
      page.getByRole("dialog", { name: "All parsing errors resolved" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to transaction review" }).click();

    await page.getByRole("button", { name: "Confirm import 2 transactions" }).click();
    await expect(page).toHaveURL(/\/imports\/files\/[^/]+\/result$/u, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "2 added, 0 enriched" }),
    ).toBeVisible();
  });

  test("surfaces a possible duplicate discovered during final confirmation", async ({
    page,
  }) => {
    await login(page);
    const csv = [
      "Alipay transaction details",
      "Alipay transaction ID,Transaction creation time,Counterparty,Item name,Amount (CNY),Income/Expense,Transaction status",
      "ALI-E2E-COHORT-1,2026-07-15 12:30:00,Group red packet sent,Red packets A,100.00,Expense,Transaction successful",
      "ALI-E2E-COHORT-2,2026-07-15 12:31:06,Group red packet sent,Red packets B,100.00,Expense,Transaction successful",
    ].join("\n");

    await page.goto("/imports/files");
    await page.locator('input[type="file"]').setInputFiles({
      name: "cohort-possible.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await page.getByRole("button", { name: "Parse and preview" }).click();
    await page.getByRole("button", { name: "Confirm import 2 transactions" }).click();

    await expect(page).toHaveURL(/reviewDuplicates=1/u);
    const duplicateDialog = page.getByRole("dialog", {
      name: "Row 4 may be a duplicate",
    });
    await expect(duplicateDialog).toBeVisible();
    await expect(
      duplicateDialog.getByText("May match batch row 3 as the same transaction", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      duplicateDialog.getByText("Batch row 3", { exact: true }),
    ).toBeVisible();
    await duplicateDialog.getByRole("button", { name: "Skip this item" }).click();
    await expect(
      page.getByRole("dialog", { name: "All possible duplicates resolved" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to transaction review" }).click();
    await page.getByRole("button", { name: "Confirm import 1 transactions" }).click();
    await expect(page).toHaveURL(/\/imports\/files\/[^/]+\/result$/u, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "1 added, 0 enriched" }),
    ).toBeVisible();
  });

  test("keeps a Mock screenshot private, supports manual review, and saves it", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/imports/screenshots");
    await page.locator('input[type="file"]').setInputFiles({
      name: "mock-payment.png",
      mimeType: "image/png",
      buffer: onePixelPng,
    });
    await page.getByRole("button", { name: "Start recognition 1 images" }).click();

    await expect(page).toHaveURL(
      /\/imports\/screenshots\/[^/]+\/review$/u,
    );
    const originalImageLink = page.getByRole("link", {
      name: /Open mock-payment\.png Original image/u,
    });
    const originalImageUrl = await originalImageLink.getAttribute("href");
    expect(originalImageUrl).toBeTruthy();
    const originalImage = await page.request.get(originalImageUrl!, {
      headers: await authenticatedHeaders(page),
    });
    expect(originalImage.status()).toBe(200);
    expect(originalImage.headers()["content-type"]).toBe("image/png");
    expect(originalImage.headers()["content-disposition"]).toContain("inline");
    expect(originalImage.headers()["x-content-type-options"]).toBe("nosniff");

    await chooseOption(page, /Transaction type/u, "Expense");
    await page.getByLabel(/Amount/u).fill("12.80");
    await page.locator('input[type="datetime-local"]').fill("2026-07-15T14:00");
    await page.getByLabel("Counterparty / Merchant").fill("Screenshot end-to-end merchant");
    await page.getByLabel(/Currency/u).fill("CNY");
    await chooseOption(page, "Category", "Food");
    await page.getByLabel("Notes").fill("Playwright Screenshot recognition lifecycle");
    await page.getByRole("button", { name: "Save fields" }).click();
    await expect(page.getByRole("button", { name: "Confirm import 1 transactions" })).toBeEnabled();
    await page.getByRole("button", { name: "Confirm import 1 transactions" }).click();

    await expect(page).toHaveURL(
      /\/imports\/screenshots\/[^/]+\/result/u,
    );
    await expect(
      page.getByRole("heading", { name: "1 screenshot transactions added to the ledger" }),
    ).toBeVisible();
  });

  test("configures, tests, disables, and resets a personal AI provider", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "AI categorization and privacy" }),
    ).toBeVisible();

    await page
      .getByLabel("OpenAI compatible Base URL")
      .fill("http://127.0.0.1:4318/v1");
    await page.getByLabel("Model name").fill("e2e-category-model");
    await page.getByLabel("API Key").fill("e2e-secret-key");
    await page.getByText("Advanced settings", { exact: true }).click();
    await page.getByLabel("Allow insecure HTTP connections").check();

    await page.getByRole("button", { name: "Test entered configuration" }).click();
    await expect(page.getByText(/Connection successful.*e2e-category-model/u)).toBeVisible();
    await page.getByRole("button", { name: "Save configuration" }).click();
    await expect(
      page.getByText("Personal AI categorization settings saved. They take effect on the next request."),
    ).toBeVisible();

    await page.reload();
    await expect(page.getByText("Personal configuration", { exact: true })).toBeVisible();
    await expect(page.getByLabel("OpenAI compatible Base URL")).toHaveValue(
      "http://127.0.0.1:4318/v1",
    );
    await expect(page.getByLabel("API Key")).toHaveValue("");
    await expect(page.getByLabel("API Key")).toHaveAttribute(
      "placeholder",
      "*********",
    );
    await page
      .getByRole("button", { name: "Remove saved key" })
      .click();
    await expect(
      page.getByText("Saving will delete the existing API Key; Public services without an API key will not be enabled."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Undo key removal" }).click();
    await expect(
      page.getByText("Saving will delete the existing API Key; Public services without an API key will not be enabled."),
    ).not.toBeVisible();
    const stateResponse = await page.request.get(
      "/api/settings/ai-categorization",
      { headers: await authenticatedHeaders(page) },
    );
    expect(stateResponse.status()).toBe(200);
    expect(JSON.stringify(await stateResponse.json())).not.toContain(
      "e2e-secret-key",
    );
    const crossOrigin = await page.request.put(
      "/api/settings/ai-categorization",
      {
        headers: {
          ...(await authenticatedHeaders(page)),
          origin: "http://evil.example",
        },
        data: {},
      },
    );
    expect(crossOrigin.status()).toBe(403);

    await page.getByLabel("Enable personal AI Category").uncheck();
    await page.getByRole("button", { name: "Save configuration" }).click();
    await expect(
      page.getByText("Personal AI categorization disabled. Deployment defaults will not be used."),
    ).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Restore deployment defaults" }).click();
    await expect(
      page.getByText("Personal configuration deleted. Deployment defaults are now active."),
    ).toBeVisible();
    await expect(page.getByText("Deployment defaults", { exact: true })).toBeVisible();
  });

  test("filters transactions, shows statistics, and manages a category on mobile", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await login(page);
    await page.goto("/transactions");
    // 类型筛选已改为 chips，点击即时生效并同步地址栏
    await page.getByRole("link", { name: "Income", exact: true }).click();
    await expect(page).toHaveURL(/\/transactions\?type=income/u);
    await page.getByLabel("Merchant or description").fill("Galaxy Technology");
    await chooseOption(page, "Source", "Alipay");
    await page.getByRole("button", { name: "View result" }).click();

    await expect(page).toHaveURL(
      /\/transactions\?.*keyword=.*&.*source=alipay&.*type=income/u,
    );
    await expect(page.getByText("Galaxy Technology", { exact: true })).toBeVisible();
    await expect(page.getByText("Total 1 transactions", { exact: true })).toBeVisible();

    await page.goto("/statistics?month=2026-07&currency=CNY");
    await expect(
      page.getByRole("heading", { name: "Insights" }),
    ).toBeVisible();
    await expect(page.getByText("Spending breakdown", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "By source" }).click();
    await expect(page.getByText("Alipay", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "By category" }).click();
    await page.setViewportSize({ height: 1_000, width: 1_440 });
    const expandCategories = page.getByRole("button", {
      name: /All \d+ categories/u,
    });
    if (await expandCategories.isVisible()) await expandCategories.click();
    const monthlyTrendCard = page.getByTestId("statistics-monthly-trend-card");
    const monthlyTrendChart = page.getByTestId("statistics-monthly-trend-chart");
    const [monthlyTrendCardBox, monthlyTrendChartBox] = await Promise.all([
      monthlyTrendCard.boundingBox(),
      monthlyTrendChart.boundingBox(),
    ]);
    expect(monthlyTrendCardBox).not.toBeNull();
    expect(monthlyTrendChartBox).not.toBeNull();
    expect(monthlyTrendChartBox!.height / monthlyTrendCardBox!.height).toBeGreaterThan(
      0.65,
    );
    await page.setViewportSize({ height: 915, width: 412 });
    for (const testId of [
      "statistics-income-amount",
      "statistics-net-expense-amount",
    ]) {
      const amount = page.getByTestId(testId);
      expect(
        await amount.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
        `${testId} should fit inside its summary column`,
      ).toBe(true);
    }
    const statisticsResponse = await page.request.get(
      "/api/statistics/overview?month=2026-07&currency=CNY",
      { headers: await authenticatedHeaders(page) },
    );
    expect(statisticsResponse.status()).toBe(200);
    expect(await statisticsResponse.json()).toMatchObject({
      data: { month: "2026-07", currency: "CNY" },
    });
    const invalidStatisticsResponse = await page.request.get(
      "/api/statistics/overview?month=0000-07",
      { headers: await authenticatedHeaders(page) },
    );
    expect(invalidStatisticsResponse.status()).toBe(400);
    expect(await invalidStatisticsResponse.json()).toMatchObject({
      error: { code: "INVALID_STATISTICS_QUERY" },
    });

    await page.goto("/settings");
    await page.getByRole("link", { name: "Manage categories and learning rules" }).click();
    // This route is compiled on its first visit by the development server.
    await expect(page).toHaveURL(/\/categories$/u, { timeout: 15_000 });
    const iconTrigger = page
      .getByRole("button", { name: "icon, current: Tags" })
      .first();
    await expect(iconTrigger).toBeVisible();
    const iconTriggerBox = await iconTrigger.boundingBox();
    expect(iconTriggerBox).not.toBeNull();
    expect(Math.abs(iconTriggerBox!.width - iconTriggerBox!.height)).toBeLessThan(
      1,
    );
    await expect(page.getByRole("menuitemradio")).toHaveCount(0);
    await iconTrigger.click();
    const iconPicker = page.getByRole("group", { name: "Icon options" });
    expect(await iconPicker.getByRole("menuitemradio").count()).toBeGreaterThan(
      36,
    );
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
      "icon menu should not introduce horizontal overflow",
    ).toBe(true);
    await page.getByRole("textbox", { name: "Search icons" }).fill("alarm-clock");
    const alarmClockIcon = iconPicker.getByRole("menuitemradio", {
      name: "alarm-clock",
      exact: true,
    });
    await alarmClockIcon.click();
    await expect(page.getByRole("menuitemradio")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "icon, current: alarm-clock" }).first(),
    ).toBeVisible();
    await page.getByLabel("Name").fill("End-to-end category");
    await page.getByRole("button", { name: "Create category" }).click();
    const category = page.locator("article").filter({ hasText: "End-to-end category" });
    await expect(category).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await category.getByRole("button", { name: "Delete" }).click();
    // dev 模式下Delete接口首次编译较慢，放宽等待时间
    await expect(category).toHaveCount(0, { timeout: 15_000 });
  });
});
