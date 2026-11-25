import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";

import {
  AlipayBillParser,
  GenericCsvBillParser,
  WechatBillParser,
} from "@/services/import-service/parsers";
import { resolveBillParser } from "@/services/import-service/parsers";
import { parseTabularFile } from "@/services/import-service/tabular-file";

const fixture = (name: string) =>
  readFileSync(
    path.resolve(
      process.cwd(),
      "src/services/import-service/fixtures",
      name,
    ),
  );

describe("bill parsers", () => {
  it("detects and parses an Alipay CSV with metadata rows", async () => {
    const file = parseTabularFile({
      originalName: "alipay.csv",
      mimeType: "text/csv",
      extension: "csv",
      bytes: fixture("alipay.csv"),
    });
    const parser = resolveBillParser(file);
    const items = await parser.parse(file);

    expect(parser).toBeInstanceOf(AlipayBillParser);
    expect(parser.metadata(file).headerRowNumber).toBe(3);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      rowNumber: 4,
      amount: "35.80",
      type: "Expense",
      merchantName: "Mountain Cafe",
      platformTransactionId: "ALI-20260715-001",
    });
  });

  it("detects and parses a WeChat CSV with currency symbols", async () => {
    const file = parseTabularFile({
      originalName: "wechat.csv",
      mimeType: "text/csv",
      extension: "csv",
      bytes: fixture("wechat.csv"),
    });
    const parser = resolveBillParser(file);
    const items = await parser.parse(file);

    expect(parser).toBeInstanceOf(WechatBillParser);
    expect(items[0]).toMatchObject({
      source: "wechat",
      amount: "¥6.20",
      paymentMethod: "WeChat balance",
      platformTransactionId: "WX-20260715-001",
    });
  });

  it("parses XLSX and applies a user-defined generic field mapping", async () => {
    const workbook = utils.book_new();
    utils.book_append_sheet(
      workbook,
      utils.aoa_to_sheet([
        ["When", "Direction", "Value", "Who", "Note"],
        ["2026-07-15 12:00:00", "expense", "12.30", "测试商户", "午餐"],
      ]),
      "账单",
    );
    const bytes = Buffer.from(write(workbook, { type: "buffer", bookType: "xlsx" }));
    const file = parseTabularFile({
      originalName: "generic.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
      bytes,
    });
    const parser = new GenericCsvBillParser({
      transactionTime: "When",
      type: "Direction",
      amount: "Value",
      merchantName: "Who",
      description: "Note",
    });
    const items = await parser.parse(file);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: "other",
      transactionTime: "2026-07-15 12:00:00",
      type: "expense",
      amount: "12.30",
      merchantName: "测试商户",
    });
  });

  it("detects a WeChat XLSX export", async () => {
    const workbook = utils.book_new();
    utils.book_append_sheet(
      workbook,
      utils.aoa_to_sheet([
        ["微信支付账单明细"],
        [
          "交易时间",
          "交易类型",
          "交易对方",
          "商品",
          "收/支",
          "金额(元)",
          "支付方式",
          "当前状态",
          "交易单号",
        ],
        [
          "2026-07-15 08:12:00",
          "商户消费",
          "上海地铁",
          "乘车码",
          "支出",
          "¥6.20",
          "零钱",
          "支付成功",
          "WX-XLSX-001",
        ],
      ]),
      "微信支付账单",
    );
    const bytes = Buffer.from(write(workbook, { type: "buffer", bookType: "xlsx" }));
    const file = parseTabularFile({
      originalName: "wechat.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
      bytes,
    });
    const parser = resolveBillParser(file);
    const items = await parser.parse(file);

    expect(parser).toBeInstanceOf(WechatBillParser);
    expect(items[0]).toMatchObject({
      source: "wechat",
      amount: "¥6.20",
      platformTransactionId: "WX-XLSX-001",
    });
  });

  it("rejects XLSX archives whose declared expansion exceeds the safety limit", () => {
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([["amount"], ["1.00"]]), "账单");
    const bytes = Buffer.from(write(workbook, { type: "buffer", bookType: "xlsx" }));
    const centralEntry = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(centralEntry).toBeGreaterThanOrEqual(0);
    bytes.writeUInt32LE(80 * 1024 * 1024 + 1, centralEntry + 24);

    expect(() =>
      parseTabularFile({
        originalName: "expansion.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        extension: "xlsx",
        bytes,
      }),
    ).toThrow("XLSX Uncompressed content exceeds the safety limit");
  });
});
