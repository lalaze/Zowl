export type LoginAttemptDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type LoginAttemptLimiterOptions = {
  now?: () => number;
  globalLimit?: number;
  globalWindowMs?: number;
  accountFailureLimit?: number;
  accountFailureWindowMs?: number;
};

export class LoginAttemptLimiter {
  private readonly now: () => number;
  private readonly globalLimit: number;
  private readonly globalWindowMs: number;
  private readonly accountFailureLimit: number;
  private readonly accountFailureWindowMs: number;
  private globalAttempts: number[] = [];
  private readonly accountFailures = new Map<string, number[]>();

  constructor(options: LoginAttemptLimiterOptions = {}) {
    this.now = options.now ?? Date.now;
    this.globalLimit = options.globalLimit ?? 60;
    this.globalWindowMs = options.globalWindowMs ?? 60_000;
    this.accountFailureLimit = options.accountFailureLimit ?? 5;
    this.accountFailureWindowMs =
      options.accountFailureWindowMs ?? 15 * 60_000;
  }

  checkAndRecordAttempt(account: string): LoginAttemptDecision {
    const now = this.now();
    this.globalAttempts = this.prune(
      this.globalAttempts,
      now - this.globalWindowMs,
    );

    if (this.globalAttempts.length >= this.globalLimit) {
      return {
        allowed: false,
        retryAfterSeconds: this.retryAfter(
          this.globalAttempts[0],
          this.globalWindowMs,
          now,
        ),
      };
    }

    const accountKey = account.trim().toLowerCase();
    const failures = this.prune(
      this.accountFailures.get(accountKey) ?? [],
      now - this.accountFailureWindowMs,
    );
    if (failures.length > 0) {
      this.accountFailures.set(accountKey, failures);
    } else {
      this.accountFailures.delete(accountKey);
    }

    if (failures.length >= this.accountFailureLimit) {
      return {
        allowed: false,
        retryAfterSeconds: this.retryAfter(
          failures[0],
          this.accountFailureWindowMs,
          now,
        ),
      };
    }

    this.globalAttempts.push(now);
    return { allowed: true };
  }

  recordFailure(account: string) {
    const accountKey = account.trim().toLowerCase();
    const now = this.now();
    const failures = this.prune(
      this.accountFailures.get(accountKey) ?? [],
      now - this.accountFailureWindowMs,
    );
    failures.push(now);
    this.accountFailures.set(accountKey, failures);
  }

  recordSuccess(account: string) {
    this.accountFailures.delete(account.trim().toLowerCase());
  }

  private prune(values: number[], threshold: number) {
    return values.filter((value) => value > threshold);
  }

  private retryAfter(firstAttempt: number, windowMs: number, now: number) {
    return Math.max(1, Math.ceil((firstAttempt + windowMs - now) / 1000));
  }
}

export const loginAttemptLimiter = new LoginAttemptLimiter();
