import type {
  BillParser,
  FieldMapping,
  ParsedFile,
  ParsedTransaction,
} from "@/services/import-service/types";
import {
  buildRecord,
  findHeaderRow,
  headerByPriority,
  headerMatches,
  isDataRow,
  parserMetadata,
  valueByAliases,
} from "@/services/import-service/parsers/helpers";

const wechatAliases = {
  type: ["收/支", "Income/Expense", "收支", "Income/Expense", "交易类型", "Transaction type"],
  amount: ["金额(元)", "Amount(CNY)", "金额（元）", "Amount (CNY)", "金额", "Amount"],
  transactionTime: ["交易时间", "Transaction time"],
  merchantName: ["交易对方", "Counterparty", "商户名称", "Merchant name", "对方名称", "Counterparty name"],
  description: ["商品", "Item", "商品名称", "Item name", "备注", "Notes"],
  paymentMethod: ["支付方式", "Payment method", "付款方式", "Payment method"],
  platformTransactionId: ["交易单号", "Transaction number", "交易号", "Transaction ID"],
  status: ["当前状态", "Current status", "交易状态", "Transaction status", "状态", "Status"],
  currency: ["币种", "Currency"],
} satisfies Record<string, string[]>;

function wechatHeaderScore(headers: string[]) {
  let score = 0;
  if (headers.some((header) => headerMatches(header, wechatAliases.amount))) score += 2;
  if (headers.some((header) => headerMatches(header, ["交易时间", "Transaction time"]))) score += 2;
  if (headers.some((header) => headerMatches(header, ["交易单号", "Transaction number"]))) score += 4;
  if (headers.some((header) => headerMatches(header, ["当前状态", "Current status"]))) score += 2;
  if (headers.some((header) => headerMatches(header, ["支付方式", "Payment method"]))) score += 1;
  return score;
}

function headerIndex(file: ParsedFile) {
  return findHeaderRow(file.rows, wechatHeaderScore);
}

function wechatMapping(headers: string[]): FieldMapping {
  return Object.fromEntries(
    Object.entries(wechatAliases)
      .map(([field, aliases]) => [field, headerByPriority(headers, aliases)])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  ) as FieldMapping;
}

export class WechatBillParser implements BillParser {
  readonly source = "wechat" as const;

  canParse(file: ParsedFile) {
    const index = headerIndex(file);
    const mentionsWechat = file.rows
      .slice(0, 20)
      .some((row) => /微信支付|微信账单/u.test(row.join(" ")));
    return index >= 0 && (wechatHeaderScore(file.rows[index]) >= 8 || mentionsWechat);
  }

  metadata(file: ParsedFile) {
    const index = headerIndex(file);
    return parserMetadata(file, index, wechatMapping(file.rows[index] ?? []));
  }

  async parse(file: ParsedFile): Promise<ParsedTransaction[]> {
    const metadata = this.metadata(file);
    const headers = metadata.headers;

    return file.rows
      .slice(metadata.headerRowNumber)
      .map((row, index) => ({ row, rowNumber: metadata.headerRowNumber + index + 1 }))
      .filter(({ row }) => isDataRow(row))
      .map(({ row, rowNumber }) => {
        const rawData = buildRecord(headers, row);
        return {
          rowNumber,
          rawData,
          source: this.source,
          type: valueByAliases(rawData, wechatAliases.type),
          amount: valueByAliases(rawData, wechatAliases.amount),
          currency: valueByAliases(rawData, wechatAliases.currency),
          merchantName: valueByAliases(rawData, wechatAliases.merchantName),
          description: valueByAliases(rawData, wechatAliases.description),
          transactionTime: valueByAliases(rawData, wechatAliases.transactionTime),
          paymentMethod: valueByAliases(rawData, wechatAliases.paymentMethod),
          platformTransactionId: valueByAliases(
            rawData,
            wechatAliases.platformTransactionId,
          ),
          status: valueByAliases(rawData, wechatAliases.status),
        };
      });
  }
}
