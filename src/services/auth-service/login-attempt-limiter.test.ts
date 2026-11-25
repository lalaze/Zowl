import { describe, expect, it } from "vitest";

import { LoginAttemptLimiter } from "@/services/auth-service/login-attempt-limiter";

describe("login attempt limiter", () => {
  it("blocks the sixth account failure for fifteen minutes", () => {
    let now = 0;
    const limiter = new LoginAttemptLimiter({ now: () => now });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(limiter.checkAndRecordAttempt("User@Example.com")).toEqual({
        allowed: true,
      });
      limiter.recordFailure("user@example.com");
    }

    expect(limiter.checkAndRecordAttempt("user@example.com")).toEqual({
      allowed: false,
      retryAfterSeconds: 900,
    });

    now = 15 * 60_000 + 1;
    expect(limiter.checkAndRecordAttempt("user@example.com")).toEqual({
      allowed: true,
    });
  });

  it("clears account failures after a successful login", () => {
    const limiter = new LoginAttemptLimiter();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      limiter.checkAndRecordAttempt("user@example.com");
      limiter.recordFailure("user@example.com");
    }

    limiter.recordSuccess("user@example.com");
    expect(limiter.checkAndRecordAttempt("user@example.com")).toEqual({
      allowed: true,
    });
  });

  it("shares the sixty-attempt global budget across accounts", () => {
    const limiter = new LoginAttemptLimiter();
    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect(
        limiter.checkAndRecordAttempt(`user-${attempt}@example.com`).allowed,
      ).toBe(true);
    }

    expect(limiter.checkAndRecordAttempt("last@example.com")).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
  });
});
