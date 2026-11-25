import { describe, expect, it } from "vitest";

import {
  greetingFor,
  localHour,
  sceneTimeFor,
} from "@/components/brand/story-scene";

describe("story scene", () => {
  it("uses the same hour bands as the Zowl app", () => {
    expect([4, 5, 7, 8, 16, 17, 18, 19, 23].map(sceneTimeFor)).toEqual([
      "night",
      "dawn",
      "dawn",
      "day",
      "day",
      "dusk",
      "dusk",
      "night",
      "night",
    ]);
  });

  it("greets by the hour", () => {
    expect(greetingFor(5)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(18)).toBe("Good evening");
    expect(greetingFor(2)).toBe("Good evening");
    expect(greetingFor(5, "zh")).toBe("早上好");
    expect(greetingFor(12, "zh")).toBe("下午好");
    expect(greetingFor(23, "zh")).toBe("晚上好");
  });

  it("reads the hour in the user's time zone, not the server's", () => {
    const instant = new Date("2026-11-13T01:30:00Z");
    expect(localHour(instant, "Asia/Shanghai")).toBe(9);
    expect(localHour(instant, "America/New_York")).toBe(20);
    expect(localHour(new Date("2026-11-13T16:00:00Z"), "Asia/Shanghai")).toBe(0);
  });
});
