import type {
  CanonicalImportField,
  FieldMapping,
  ParsedFile,
  ParserMetadata,
} from "@/services/import-service/types";

export const fieldAliases: Record<CanonicalImportField, string[]> = {
  type: ["收/支", "Income/Expense", "收支", "Income/Expense", "交易类型", "Transaction type", "类型", "Type", "type"],
  amount: [
    "金额（元）", "Amount (CNY)",
    "金额(元)", "Amount(CNY)",
    "金额", "Amount",
    "交易金额", "Transaction amount",
    "订单金额（元）", "Order amount (CNY)",
    "amount",
  ],
  transactionTime: [
    "交易时间", "Transaction time",
    "付款时间", "Payment time",
    "交易创建时间", "Transaction creation time",
    "创建时间", "Creation time",
    "time",
    "date",
    "datetime",
  ],
  merchantName: [
    "交易对方", "Counterparty",
    "对方名称", "Counterparty name",
    "商家名称", "Merchant name",
    "商户名称", "Merchant name",
    "merchant",
    "payee",
  ],
  description: [
    "商品名称", "Item name",
    "商品", "Item",
    "商品说明", "Item description",
    "交易说明", "Transaction description",
    "备注", "Notes",
    "description",
    "memo",
  ],
  paymentMethod: ["付款方式", "Payment method", "支付方式", "Payment method", "payment method", "account"],
  platformTransactionId: [
    "支付宝交易号", "Alipay transaction ID",
    "交易号", "Transaction ID",
    "交易单号", "Transaction number",
    "transaction id",
    "transactionid",
    "id",
  ],
  status: ["交易状态", "Transaction status", "当前状态", "Current status", "状态", "Status", "status"],
  currency: ["币种", "Currency", "currency"],
};

export function normalizeHeader(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .trim();
}

export function headerMatches(header: string, aliases: string[]) {
  const normalized = normalizeHeader(header);
  return aliases.some((alias) => normalizeHeader(alias) === normalized);
}

export function findHeaderRow(
  rows: string[][],
  score: (headers: string[]) => number,
) {
  let best: { index: number; score: number } | null = null;

  const candidates = rows.slice(0, 40);
  for (let index = 0; index < candidates.length; index += 1) {
    const row = candidates[index];
    if (!row) continue;
    const currentScore = score(row);
    if (!best || currentScore > best.score) best = { index, score: currentScore };
  }

  return best && best.score > 0 ? best.index : -1;
}

export function detectMapping(headers: string[]): FieldMapping {
  const mapping: FieldMapping = {};

  (Object.keys(fieldAliases) as CanonicalImportField[]).forEach((field) => {
    const header = headers.find((candidate) =>
      headerMatches(candidate, fieldAliases[field]),
    );
    if (header) mapping[field] = header;
  });

  return mapping;
}

export function buildRecord(headers: string[], row: string[]) {
  return headers.reduce<Record<string, string>>((record, header, index) => {
    const key = header.trim() || `Unnamed column_${index + 1}`;
    record[key] = String(row[index] ?? "").trim();
    return record;
  }, {});
}

export function valueFrom(
  record: Record<string, string>,
  mapping: FieldMapping,
  field: CanonicalImportField,
) {
  const header = mapping[field];
  return header ? record[header]?.trim() || undefined : undefined;
}

export function headerByPriority(headers: string[], aliases: string[]) {
  for (const alias of aliases) {
    const header = headers.find((candidate) =>
      headerMatches(candidate, [alias]),
    );
    if (header) return header;
  }
  return undefined;
}

export function valueByAliases(
  record: Record<string, string>,
  aliases: string[],
) {
  const header = headerByPriority(Object.keys(record), aliases);
  return header ? record[header]?.trim() || undefined : undefined;
}

export function isDataRow(row: string[]) {
  if (!row.some((value) => value.trim())) return false;
  const joined = row.join("").trim();
  return !/^(导出信息|共\d+笔|合计|说明[:：])/u.test(joined);
}

export function parserMetadata(
  file: ParsedFile,
  headerRowIndex: number,
  mapping?: FieldMapping,
): ParserMetadata {
  const headers = file.rows[headerRowIndex]?.map((value) => value.trim()) ?? [];
  return {
    headerRowNumber: headerRowIndex + 1,
    headers,
    mapping: mapping ?? detectMapping(headers),
  };
}
