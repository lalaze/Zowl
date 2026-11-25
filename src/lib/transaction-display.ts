import { localeTag, type Locale } from "@/lib/i18n/locale";
import type { TransactionView } from "@/types/transaction";

const transactionTypeLabels: Record<TransactionView["type"], string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  refund: "Refund",
};

const transactionSourceLabels: Record<TransactionView["source"], string> = {
  manual: "Manual entry",
  screenshot: "Payment screenshot",
  alipay: "Alipay",
  wechat: "WeChat Pay",
  cmb: "China Merchants Bank",
  taobao: "Taobao",
  pinduoduo: "Pinduoduo",
  jd: "JD.com",
  pupu: "Pupu",
  other: "Other sources",
};

const transactionTypeLabelsZh: Record<TransactionView["type"], string> = {
  expense: "支出",
  income: "收入",
  transfer: "转账",
  refund: "退款",
};

const transactionSourceLabelsZh: Record<TransactionView["source"], string> = {
  manual: "手动记账",
  screenshot: "支付截图",
  alipay: "支付宝",
  wechat: "微信支付",
  cmb: "招商银行",
  taobao: "淘宝",
  pinduoduo: "拼多多",
  jd: "京东",
  pupu: "朴朴",
  other: "其他来源",
};

export function transactionTypeLabel(type: TransactionView["type"], locale: Locale) {
  return (locale === "zh" ? transactionTypeLabelsZh : transactionTypeLabels)[type];
}

export function transactionSourceLabel(
  source: TransactionView["source"],
  locale: Locale,
) {
  return (locale === "zh" ? transactionSourceLabelsZh : transactionSourceLabels)[source];
}

export function isIncoming(type: TransactionView["type"]) {
  return type === "income" || type === "refund";
}

export function formatTransactionDate(
  value: string,
  withYear = false,
  locale: Locale = "en",
) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    ...(withYear ? { year: "numeric" as const } : {}),
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
