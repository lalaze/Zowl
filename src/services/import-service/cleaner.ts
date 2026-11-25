import { z } from "zod";

import { importDecisions, transactionTypes } from "@/db/schema";
import {
  decimalToMinor,
  isSupportedCurrency,
  minorToDecimal,
} from "@/lib/money";
import { normalizeTransactionTime } from "@/lib/transaction-time";
import type {
  ImportValidationError,
  ImportWarning,
  NormalizedImportTransaction,
  ParsedTransaction,
} from "@/services/import-service/types";

const CLOSED_STATUS_PATTERN =
  /交易关闭|已关闭|已撤销|等待付款|付款失败|支付失败|订单已取消|transaction closed|closed|revoked|awaiting payment|payment failed|order canceled/iu;

function cleanText(value: string | undefined, maxLength: number) {
  const cleaned = value?.normalize("NFKC").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function normalizeType(parsed: ParsedTransaction) {
  const material = [parsed.type, parsed.status, parsed.description]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");

  if (/退款|refund/u.test(material)) return "refund" as const;
  if (/不计收支|转账|transfer|excluded from income and expenses/u.test(material)) return "transfer" as const;
  if (/收入|已收入|income|工资/u.test(material)) return "income" as const;
  if (/支出|已支出|expense/u.test(material)) return "expense" as const;
  return null;
}

function normalizeAmount(value: string | undefined, currency: string) {
  if (!value) return null;
  const cleaned = value
    .normalize("NFKC")
    .replace(/[¥￥元\s]/gu, "")
    .replace(/^[-+]/, "")
    .replace(/^\((.*)\)$/, "$1");

  try {
    const amountMinor = decimalToMinor(cleaned, currency);
    return amountMinor > 0
      ? { amount: minorToDecimal(amountMinor, currency), amountMinor }
      : null;
  } catch {
    return null;
  }
}

export function parseChinaTransactionTime(value: string | undefined) {
  if (!value) return null;
  const normalized = value.normalize("NFKC").trim();

  if (/[zZ]$|[+-]\d{2}:?\d{2}$/u.test(normalized)) {
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const match = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T](\d{1,2}):?(\d{2})(?::?(\d{2}))?)?$/u.exec(
    normalized,
  );
  if (!match) return null;

  const [, yearValue, monthValue, dayValue, hourValue = "0", minuteValue = "0", secondValue = "0"] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const second = Number(secondValue);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const roundTrip = new Date(localAsUtc);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    return null;
  }

  return new Date(localAsUtc - 8 * 60 * 60 * 1000).toISOString();
}

export function cleanParsedTransaction(parsed: ParsedTransaction) {
  const errors: ImportValidationError[] = [];
  const warnings: ImportWarning[] = [];
  const type = normalizeType(parsed);
  const currency = cleanText(parsed.currency, 3)?.toUpperCase() ?? "CNY";
  const currencySupported = isSupportedCurrency(currency);
  const amount = currencySupported
    ? normalizeAmount(parsed.amount, currency)
    : null;
  const transactionTime = parseChinaTransactionTime(parsed.transactionTime);
  const status = cleanText(parsed.status, 80);

  if (!type) {
    errors.push({ field: "type", code: "MISSING_TYPE", message: "Cannot determine transaction type" });
  }
  if (!currencySupported) {
    errors.push({
      field: "currency",
      code: "UNSUPPORTED_CURRENCY",
      message: "Only currencies with two decimal places are supported",
    });
  }
  if (!amount && currencySupported) {
    errors.push({ field: "amount", code: "INVALID_AMOUNT", message: "Amount is missing or invalid" });
  }
  if (!transactionTime) {
    errors.push({ field: "transactionTime", code: "INVALID_TIME", message: "Transaction time is missing or invalid" });
  }

  const merchantName = cleanText(parsed.merchantName, 120);
  if (!merchantName) {
    warnings.push({ code: "MISSING_MERCHANT", message: "Merchant name is empty. Consider adding it before import" });
  }
  if (status && CLOSED_STATUS_PATTERN.test(status)) {
    warnings.push({ code: "NON_SETTLED_STATUS", message: `“${status}” is excluded from import by default` });
  }

  const data: NormalizedImportTransaction = {
    type,
    amount: amount?.amount ?? "",
    amountMinor: amount?.amountMinor ?? null,
    currency,
    merchantName,
    description: cleanText(parsed.description, 240),
    categoryId: null,
    categoryName: null,
    transactionTime,
    source: parsed.source,
    paymentMethod: cleanText(parsed.paymentMethod, 80),
    platformTransactionId: cleanText(parsed.platformTransactionId, 160),
    status,
  };

  return {
    data,
    errors,
    warnings,
    shouldSkip: errors.length > 0 || Boolean(status && CLOSED_STATUS_PATTERN.test(status)),
  };
}

export const importItemEditSchema = z.object({
  type: z.enum(transactionTypes),
  amount: z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/u, "Invalid amount format"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/u)
    .refine(isSupportedCurrency, "Only currencies with two decimal places are supported"),
  merchantName: z.string().trim().max(120).nullable(),
  description: z.string().trim().max(240).nullable(),
  categoryId: z.string().trim().max(80).nullable(),
  transactionTime: z
    .iso.datetime({ offset: true })
    .transform(normalizeTransactionTime),
  paymentMethod: z.string().trim().max(80).nullable(),
  platformTransactionId: z.string().trim().max(160).nullable(),
  status: z.string().trim().max(80).nullable(),
  decision: z.enum(importDecisions),
});

export type ImportItemEditInput = z.infer<typeof importItemEditSchema>;
