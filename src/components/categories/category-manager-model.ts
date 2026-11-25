import type { Locale } from "@/lib/i18n/locale";

export type CategoryKind = "expense" | "income" | "both";

export type ManagedCategory = {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string | null;
  color: string | null;
  isSystem: boolean;
  sortOrder: number;
  transactionCount: number;
  ruleCount: number;
};

export type ManagedMerchantRule = {
  id: string;
  normalizedMerchantName: string;
  matchType: "exact" | "contains";
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
};

/** Built-ins still named in the other language than `locale` (see builtInNameStatus). */
export type BuiltInNameStatus = {
  locale: Locale;
  renamable: number;
  conflicting: number;
};

export type BuiltInNamesResult = {
  renamed: number;
  skipped: number;
  categories: ManagedCategory[];
  rules: ManagedMerchantRule[];
};

export type CategoryFormValue = {
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
};

export const emptyCategoryForm: CategoryFormValue = {
  name: "",
  kind: "expense",
  icon: "Tags",
  color: "#10b981",
};

export const categoryKindLabels: Record<CategoryKind, string> = {
  expense: "Expense",
  income: "Income",
  both: "Income and expense",
};

const categoryKindLabelsZh: Record<CategoryKind, string> = {
  expense: "支出",
  income: "收入",
  both: "收支通用",
};

export function categoryKindLabel(kind: CategoryKind, locale: Locale) {
  return (locale === "zh" ? categoryKindLabelsZh : categoryKindLabels)[kind];
}
