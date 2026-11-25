import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

const credentials = {
  email: process.env.DEMO_EMAIL ?? "e2e@zemoney.local",
  password: process.env.DEMO_PASSWORD ?? "zemoney-e2e-password",
};

// A fresh Next.js development server compiles each API route on first use.
// This contract intentionally crosses several routes, so retain enough budget
// for that one-time work while keeping the production-server run fast.
test.setTimeout(120_000);

test("mobile bearer session accesses the shared ledger and can be revoked", async ({
  request,
}) => {
  const login = await request.post("/api/auth/token", { data: credentials });
  expect(login.status()).toBe(200);
  const loginPayload = (await login.json()) as {
    data: {
      tokenType: string;
      accessToken: string;
      expiresAt: string;
      user: { email: string; displayName: string; role: string };
    };
  };
  expect(loginPayload.data).toMatchObject({
    tokenType: "Bearer",
    user: { email: credentials.email, role: "admin" },
  });
  expect(loginPayload.data.accessToken).toMatch(/^[A-Za-z0-9_-]+$/u);

  const headers = {
    authorization: `Bearer ${loginPayload.data.accessToken}`,
  };
  for (const path of [
    "/api/auth/session",
    "/api/categories",
    "/api/transactions?limit=1",
    "/api/statistics/overview?month=2026-07&currency=CNY",
    "/api/imports/screenshots",
    "/api/imports/screenshots/provider",
    "/api/admin/accounts?page=1&limit=20",
  ]) {
    const response = await request.get(path, { headers });
    expect(response.status(), path).toBe(200);
    expect(await response.json()).toHaveProperty("data");
  }

  const profile = await request.patch("/api/settings/profile", {
    headers,
    data: { displayName: loginPayload.data.user.displayName },
  });
  expect(profile.status()).toBe(200);

  const confirmationId = randomUUID();
  const created = await request.post("/api/transactions", {
    headers,
    data: {
      type: "expense",
      amount: "12.80",
      currency: "CNY",
      merchantName: "Bearer API Acceptance",
      description: "Mobile contract test",
      categoryId: null,
      transactionTime: "2026-07-18T04:30:00.000Z",
      paymentMethod: "Test",
      confirmation: { id: confirmationId, version: 1 },
    },
  });
  expect(created.status()).toBe(201);
  const createdTransaction = (await created.json()) as {
    data: { id: string; currentRevisionId: string };
  };

  const amended = await request.patch(
    `/api/transactions/${createdTransaction.data.id}`,
    {
      headers,
      data: {
        type: "expense",
        amount: "13.80",
        currency: "CNY",
        merchantName: "Bearer API Acceptance",
        description: "Mobile amendment contract test",
        categoryId: null,
        transactionTime: "2026-07-18T04:30:00.000Z",
        paymentMethod: "Test",
        learnCategoryRule: false,
        expectedRevisionId: createdTransaction.data.currentRevisionId,
        operationId: randomUUID(),
      },
    },
  );
  expect(amended.status()).toBe(200);
  const amendedTransaction = (await amended.json()) as {
    data: { currentRevisionId: string };
  };

  const voided = await request.delete(
    `/api/transactions/${createdTransaction.data.id}`,
    {
      headers,
      data: {
        expectedRevisionId: amendedTransaction.data.currentRevisionId,
        operationId: randomUUID(),
      },
    },
  );
  expect(voided.status()).toBe(200);

  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const submissionId = randomUUID();
  const screenshot = await request.post("/api/imports/screenshots", {
    headers,
    multipart: {
      submissionId,
      consentToThirdParty: "false",
      images: {
        name: "mobile-contract.png",
        mimeType: "image/png",
        buffer: onePixelPng,
      },
    },
  });
  expect(screenshot.status()).toBe(201);
  const screenshotPayload = (await screenshot.json()) as {
    data: { jobId: string };
  };
  const retried = await request.post("/api/imports/screenshots", {
    headers,
    multipart: {
      submissionId,
      consentToThirdParty: "false",
      images: { name: "mobile-contract.png", mimeType: "image/png", buffer: onePixelPng },
    },
  });
  expect(retried.status()).toBe(201);
  expect((await retried.json()).data.jobId).toBe(screenshotPayload.data.jobId);
  const pendingJobs = await request.get("/api/imports/screenshots?status=pending", { headers });
  expect((await pendingJobs.json()).data.filter((job: { id: string }) => job.id === screenshotPayload.data.jobId)).toHaveLength(1);
  const review = await request.get(
    `/api/imports/screenshots/${screenshotPayload.data.jobId}`,
    { headers },
  );
  expect(review.status()).toBe(200);
  const reviewPayload = (await review.json()) as {
    data: { items: Array<{ previewUrl: string }> };
  };
  const previewUrl = reviewPayload.data.items[0]?.previewUrl;
  expect(previewUrl).toMatch(/^\/api\/files\//u);
  expect((await request.get(previewUrl, { headers })).status()).toBe(200);

  const logout = await request.post("/api/auth/logout", { headers });
  expect(logout.status()).toBe(200);
  expect(
    (await request.get("/api/auth/session", { headers })).status(),
  ).toBe(401);
});

test("token login rejects invalid credentials", async ({ request }) => {
  const response = await request.post("/api/auth/token", {
    data: { email: credentials.email, password: "incorrect-password" },
  });
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({
    error: { code: "INVALID_CREDENTIALS" },
  });
});

test("an invalid bearer token does not fall back to a valid web cookie", async ({
  request,
}) => {
  expect(
    (await request.post("/api/auth/login", { data: credentials })).status(),
  ).toBe(200);
  const response = await request.get("/api/auth/session", {
    headers: { authorization: "Bearer invalid-token" },
  });
  expect(response.status()).toBe(401);
});
