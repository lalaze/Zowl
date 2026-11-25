import { describe, expect, it } from "vitest";

import {
  cleanParsedTransaction,
  parseChinaTransactionTime,
} from "@/services/import-service/cleaner";

describe("import cleaner", () => {
  it("normalizes money, type and China local time", () => {
    const result = cleanParsedTransaction({
      rowNumber: 2,
      rawData: {},
      source: "wechat",
      type: "支出",
      amount: "￥1,234.50元",
      transactionTime: "2026-07-15 12:30:00",
      merchantName: "  山岚  咖啡  ",
      status: "支付成功",
    });

    expect(result.errors).toEqual([]);
    expect(result.data).toMatchObject({
      type: "expense",
      amount: "1234.50",
      amountMinor: 123450,
      transactionTime: "2026-07-15T04:30:00.000Z",
      merchantName: "山岚 咖啡",
    });
  });

  it("recognizes refunds before generic income labels", () => {
    const result = cleanParsedTransaction({
      rowNumber: 2,
      rawData: {},
      source: "alipay",
      type: "收入",
      amount: "35.80",
      transactionTime: "2026-07-15 12:30:00",
      status: "退款成功",
    });
    expect(result.data.type).toBe("refund");
  });

  it("marks missing required data and closed transactions for skipping", () => {
    const missing = cleanParsedTransaction({
      rowNumber: 2,
      rawData: {},
      source: "other",
    });
    expect(missing.errors.map((error) => error.code)).toEqual([
      "MISSING_TYPE",
      "INVALID_AMOUNT",
      "INVALID_TIME",
    ]);
    expect(missing.shouldSkip).toBe(true);

    const closed = cleanParsedTransaction({
      rowNumber: 3,
      rawData: {},
      source: "alipay",
      type: "支出",
      amount: "10.00",
      transactionTime: "2026-07-15 12:30:00",
      status: "交易关闭",
    });
    expect(closed.warnings[0]?.code).toBe("MISSING_MERCHANT");
    expect(closed.warnings.some((warning) => warning.code === "NON_SETTLED_STATUS")).toBe(true);
    expect(closed.shouldSkip).toBe(true);
  });

  it("rejects impossible calendar dates", () => {
    expect(parseChinaTransactionTime("2026-02-30 12:00:00")).toBeNull();
  });

  it("rejects currencies outside the MVP's fixed two-decimal model", () => {
    const result = cleanParsedTransaction({
      rowNumber: 2,
      rawData: {},
      source: "other",
      type: "支出",
      amount: "35.801",
      currency: "BHD",
      transactionTime: "2026-07-15 12:30:00",
    });

    expect(result.errors).toEqual([
      expect.objectContaining({ code: "UNSUPPORTED_CURRENCY" }),
    ]);
    expect(result.shouldSkip).toBe(true);
  });
});
