import { describe, expect, it } from "vitest";

import {
  decimalToMinor,
  formatMoney,
  formatSignedMoney,
  InvalidMoneyError,
  minorToDecimal,
} from "@/lib/money";

describe("money", () => {
  it.each([
    ["0", 0],
    ["35.8", 3580],
    ["35.80", 3580],
    ["1,234.56", 123456],
    ["３５．８０", 3580],
  ])("converts %s to integer minor units", (input, expected) => {
    expect(decimalToMinor(input)).toBe(expected);
  });

  it.each(["", "-1", "1.234", "12CNY", ".50"])(
    "rejects invalid decimal input %s",
    (input) => {
      expect(() => decimalToMinor(input)).toThrow(InvalidMoneyError);
    },
  );

  it("formats integer minor units without floating point arithmetic", () => {
    expect(minorToDecimal(3580)).toBe("35.80");
    expect(minorToDecimal(5)).toBe("0.05");
  });

  it("keeps the negative sign visually separate from the currency symbol", () => {
    expect(formatMoney(-349_606)).toBe("-\u202f¥3,496.06");
    expect(formatSignedMoney(3_580, "-")).toBe("-\u202f¥35.80");
    expect(formatSignedMoney(3_580, "+")).toBe("+\u202f¥35.80");
  });

  it("rejects non-two-decimal currencies without reinterpreting legacy values", () => {
    expect(() => decimalToMinor("3580", "JPY")).toThrow(InvalidMoneyError);
    expect(() => decimalToMinor("35.801", "BHD")).toThrow(InvalidMoneyError);
    expect(minorToDecimal(3580, "JPY")).toBe("35.80");
    expect(formatMoney(3580, "JPY", "ja-JP")).toContain("35.80");
  });
});
