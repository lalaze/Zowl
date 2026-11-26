import { describe, expect, it } from "vitest";

import { localDayOfMonth, toDatetimeLocal } from "@/lib/date-time";

describe("date-time helpers", () => {
  it("formats ISO timestamps for datetime-local inputs with minute or second precision", () => {
    const sample = new Date(2026, 6, 15, 9, 5, 42);
    const iso = sample.toISOString();

    expect(toDatetimeLocal(iso)).toBe("2026-07-15T09:05:42");
    expect(toDatetimeLocal(iso, "seconds")).toBe("2026-07-15T09:05:42");
    expect(toDatetimeLocal(iso, "minutes")).toBe("2026-07-15T09:05");
  });

  it("returns an empty string for missing or invalid timestamps", () => {
    expect(toDatetimeLocal(null)).toBe("");
    expect(toDatetimeLocal(undefined)).toBe("");
    expect(toDatetimeLocal("")).toBe("");
    expect(toDatetimeLocal("not-a-date", "minutes")).toBe("");
  });

  it("reads the local calendar day in the given time zone", () => {
    // 2026-07-31T20:00:00Z is Aug 1 in Asia/Shanghai and Jul 31 in America/New_York.
    const instant = new Date("2026-07-31T20:00:00Z");
    expect(localDayOfMonth(instant, "Asia/Shanghai")).toBe(1);
    expect(localDayOfMonth(instant, "America/New_York")).toBe(31);
  });
});
