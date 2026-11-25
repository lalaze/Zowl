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

const alipayAliases = {
  type: ["收/支", "Income/Expense", "收支", "Income/Expense", "类型", "Type"],
  amount: ["金额（元）", "Amount (CNY)", "金额(元)", "Amount(CNY)", "订单金额（元）", "Order amount (CNY)", "金额", "Amount"],
  transactionTime: ["付款时间", "Payment time", "交易时间", "Transaction time", "交易创建时间", "Transaction creation time"],
  merchantName: ["交易对方", "Counterparty", "对方名称", "Counterparty name", "商家名称", "Merchant name"],
  description: ["商品名称", "Item name", "商品说明", "Item description", "备注", "Notes"],
  paymentMethod: ["付款方式", "Payment method", "支付方式", "Payment method"],
  platformTransactionId: ["支付宝交易号", "Alipay transaction ID", "交易号", "Transaction ID"],
  status: ["交易状态", "Transaction status", "状态", "Status"],
  currency: ["币种", "Currency"],
} satisfies Record<string, string[]>;

function alipayHeaderScore(headers: string[]) {
  let score = 0;
  if (headers.some((header) => headerMatches(header, alipayAliases.amount))) score += 2;
  if (headers.some((header) => headerMatches(header, alipayAliases.transactionTime))) score += 2;
  if (headers.some((header) => headerMatches(header, ["支付宝交易号", "Alipay transaction ID"]))) score += 4;
  if (headers.some((header) => headerMatches(header, ["收/支", "Income/Expense"]))) score += 2;
  if (headers.some((header) => headerMatches(header, alipayAliases.merchantName))) score += 1;
  return score;
}

function headerIndex(file: ParsedFile) {
  return findHeaderRow(file.rows, alipayHeaderScore);
}

function alipayMapping(headers: string[]): FieldMapping {
  return Object.fromEntries(
    Object.entries(alipayAliases)
      .map(([field, aliases]) => [field, headerByPriority(headers, aliases)])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  ) as FieldMapping;
}

export class AlipayBillParser implements BillParser {
  readonly source = "alipay" as const;

  canParse(file: ParsedFile) {
    const index = headerIndex(file);
    const mentionsAlipay = file.rows
      .slice(0, 20)
      .some((row) => row.join(" ").includes("支付宝"));
    return index >= 0 && (alipayHeaderScore(file.rows[index]) >= 8 || mentionsAlipay);
  }

  metadata(file: ParsedFile) {
    const index = headerIndex(file);
    return parserMetadata(file, index, alipayMapping(file.rows[index] ?? []));
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
          type: valueByAliases(rawData, alipayAliases.type),
          amount: valueByAliases(rawData, alipayAliases.amount),
          currency: valueByAliases(rawData, alipayAliases.currency),
          merchantName: valueByAliases(rawData, alipayAliases.merchantName),
          description: valueByAliases(rawData, alipayAliases.description),
          transactionTime: valueByAliases(rawData, alipayAliases.transactionTime),
          paymentMethod: valueByAliases(rawData, alipayAliases.paymentMethod),
          platformTransactionId: valueByAliases(
            rawData,
            alipayAliases.platformTransactionId,
          ),
          status: valueByAliases(rawData, alipayAliases.status),
        };
      });
  }
}
