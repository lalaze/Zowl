import type { Locale } from "@/lib/i18n/locale";

/**
 * Built-in categories. Code finds them by `key` (their id is
 * `${userId}:category:${key}`), never by name: names are seeded in the
 * language of the request that created the account and can later be switched
 * to the other language from the Categories page.
 */
export const defaultCategories = [
  {
    key: "food",
    names: { en: "Food", zh: "餐饮" },
    kind: "expense",
    icon: "Utensils",
    color: "#f97316",
  },
  {
    key: "delivery",
    names: { en: "Delivery", zh: "外卖" },
    kind: "expense",
    icon: "Bike",
    color: "#fb7185",
  },
  {
    key: "transport",
    names: { en: "Transport", zh: "交通" },
    kind: "expense",
    icon: "Train",
    color: "#3b82f6",
  },
  {
    key: "shopping",
    names: { en: "Shopping", zh: "购物" },
    kind: "expense",
    icon: "ShoppingBag",
    color: "#a855f7",
  },
  {
    key: "entertainment",
    names: { en: "Entertainment", zh: "娱乐" },
    kind: "expense",
    icon: "Clapperboard",
    color: "#ec4899",
  },
  {
    key: "housing",
    names: { en: "Housing", zh: "居住" },
    kind: "expense",
    icon: "House",
    color: "#64748b",
  },
  {
    key: "medical",
    names: { en: "Healthcare", zh: "医疗" },
    kind: "expense",
    icon: "HeartPulse",
    color: "#ef4444",
  },
  {
    key: "education",
    names: { en: "Education", zh: "教育" },
    kind: "expense",
    icon: "GraduationCap",
    color: "#06b6d4",
  },
  {
    key: "digital",
    names: { en: "Electronics", zh: "数码" },
    kind: "expense",
    icon: "Laptop",
    color: "#6366f1",
  },
  {
    key: "transfer",
    names: { en: "Transfer", zh: "转账" },
    kind: "both",
    icon: "ArrowLeftRight",
    color: "#0f766e",
  },
  {
    key: "redpacket",
    names: { en: "Red packets", zh: "红包" },
    kind: "both",
    icon: "Gift",
    color: "#dc2626",
  },
  {
    key: "salary",
    names: { en: "Salary", zh: "工资" },
    kind: "income",
    icon: "WalletCards",
    color: "#16a34a",
  },
  {
    key: "refund",
    names: { en: "Refund", zh: "退款" },
    kind: "income",
    icon: "RotateCcw",
    color: "#14b8a6",
  },
  {
    key: "other",
    names: { en: "Other", zh: "其他" },
    kind: "both",
    icon: "Shapes",
    color: "#94a3b8",
  },
] as const;

export type DefaultCategory = (typeof defaultCategories)[number];
export type DefaultCategoryKey = DefaultCategory["key"];

export function defaultCategoryId(userId: string, key: DefaultCategoryKey) {
  return `${userId}:category:${key}`;
}

export function findDefaultCategory(key: DefaultCategoryKey): DefaultCategory {
  return defaultCategories.find((category) => category.key === key)!;
}

/** The built-in whose default name, in either language, is exactly `name`. */
export function defaultCategoryForName(name: string | null | undefined) {
  if (!name) return null;
  return (
    defaultCategories.find(
      (category) => category.names.en === name || category.names.zh === name,
    ) ?? null
  );
}

/**
 * Which built-in a stored category is: by its system id, else (for accounts
 * seeded with other ids) by a default name in either language.
 */
export function builtInCategoryKey(
  userId: string,
  category: { id: string; name: string; isSystem: boolean },
): DefaultCategoryKey | null {
  if (!category.isSystem) return null;
  const byId = defaultCategories.find(
    (definition) => category.id === defaultCategoryId(userId, definition.key),
  );
  return (byId ?? defaultCategoryForName(category.name))?.key ?? null;
}

/** Rows for a new account's built-in categories, named in `locale`. */
export function defaultCategoryRows(
  userId: string,
  locale: Locale,
  timestamp: string,
) {
  return defaultCategories.map((category, sortOrder) => ({
    id: defaultCategoryId(userId, category.key),
    userId,
    name: category.names[locale],
    kind: category.kind,
    icon: category.icon,
    color: category.color,
    isSystem: true,
    sortOrder,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}
