import type { Translate } from "@/lib/i18n/locale";

// Kept free of recharts so server-rendered chart shells can use them without
// pulling the chart library into the page's client bundle.

/** The statistics service names the no-category bucket "Uncategorized". */
export function categoryDisplayName(
  item: { categoryId: string | null; name: string },
  t: Translate,
) {
  return item.categoryId === null && item.name === "Uncategorized"
    ? t("Uncategorized", "未分类")
    : item.name;
}

export function validChartColor(value: string) {
  return /^#[0-9a-f]{6}$/iu.test(value) ? value : "#64748b";
}
