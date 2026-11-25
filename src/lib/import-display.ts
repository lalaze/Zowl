import type { Locale } from "@/lib/i18n/locale";
import type { ImportSource } from "@/services/import-service/types";

const importSourceLabels: Record<ImportSource, string> = {
  alipay: "Alipay",
  wechat: "WeChat Pay",
  other: "Generic statement",
};

const importStatusLabels = {
  parsing: "Parsing",
  reviewing: "Awaiting confirmation",
  committing: "Importing",
  completed: "Completed",
  failed: "Failed",
};

export type ImportStatus = keyof typeof importStatusLabels;

const importSourceLabelsZh: Record<ImportSource, string> = {
  alipay: "支付宝",
  wechat: "微信支付",
  other: "通用账单",
};

const importStatusLabelsZh: Record<ImportStatus, string> = {
  parsing: "正在解析",
  reviewing: "待确认",
  committing: "正在导入",
  completed: "已完成",
  failed: "失败",
};

export function importSourceLabel(source: ImportSource, locale: Locale) {
  return (locale === "zh" ? importSourceLabelsZh : importSourceLabels)[source];
}

export function importStatusLabel(status: ImportStatus, locale: Locale) {
  return (locale === "zh" ? importStatusLabelsZh : importStatusLabels)[status];
}
