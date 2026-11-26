import { translator, type Locale } from "@/lib/i18n/locale";
import { formatMoney } from "@/lib/money";
import type { StatisticsOverview } from "@/services/statistics-service";

/** One natural-language line about the month, said by the owl. */
export function companionLine(
  overview: StatisticsOverview,
  locale: Locale = "en",
) {
  const t = translator(locale);
  const { summary, changes } = overview;
  if (summary.transactionCount === 0) {
    return t(
      "Record your first transaction today. I’ll keep watch.",
      "今天就记下第一笔吧，我会替你看着。",
    );
  }
  const expense = changes.netExpense;
  const spent = formatMoney(summary.netExpenseMinor);
  if (expense.ratePercent === null) {
    return t(
      `You have spent ${spent} this month. Keep tracking to see the full picture.`,
      `本月已支出 ${spent}，坚持记账，全貌会越来越清楚。`,
    );
  }
  if (expense.status === "unchanged") {
    return t(
      `You have spent ${spent} this month, about the same as last month.`,
      `本月已支出 ${spent}，和上月差不多。`,
    );
  }
  const percent = Math.abs(expense.ratePercent);
  return expense.status === "up"
    ? t(
        `You have spent ${spent} this month, ${percent}% more than last month.`,
        `本月已支出 ${spent}，比上月多 ${percent}%。`,
      )
    : t(
        `You have spent ${spent} this month, ${percent}% less than last month. Nicely steady.`,
        `本月已支出 ${spent}，比上月少 ${percent}%，稳稳的。`,
      );
}
