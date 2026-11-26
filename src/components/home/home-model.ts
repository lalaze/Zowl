import {
  greetingFor,
  localHour,
  sceneTimeFor,
  type SceneTime,
} from "@/components/brand/story-scene";
import { companionLine } from "@/components/home/owl-companion";
import { localDayOfMonth } from "@/lib/date-time";
import {
  localeTag,
  translator,
  type Locale,
  type Translate,
} from "@/lib/i18n/locale";
import type { StatisticsOverview } from "@/services/statistics-service";

export const STREAK_DAYS = 21;
export const SAVINGS_GOAL_MINOR = 1_000_000;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function dateLabel(now: Date, timeZone: string, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(now);
}

function monthLabel(monthNumber: number, locale: Locale) {
  if (locale === "zh") {
    return monthNumber >= 1 && monthNumber <= 12 ? `${monthNumber}月` : "本月";
  }
  return MONTH_NAMES[monthNumber - 1] ?? "This month";
}

function balanceChangeLabel(
  change: StatisticsOverview["changes"]["balance"],
  t: Translate,
) {
  if (change.ratePercent === null) {
    return t("No previous-month comparison", "暂无上月对比");
  }
  if (change.status === "unchanged") {
    return t("Unchanged from last month", "与上月持平");
  }
  const arrow = change.status === "up" ? "▲" : "▼";
  const sign = change.status === "up" ? "+" : "−";
  return t(
    `${arrow} vs. last month ${sign}${Math.abs(change.ratePercent)}%`,
    `${arrow} 较上月 ${sign}${Math.abs(change.ratePercent)}%`,
  );
}

export type HomeModel = {
  hour: number;
  sceneTime: SceneTime;
  greeting: string;
  firstName: string;
  greetingHeading: string;
  companionMessage: string;
  dateHeading: string;
  checkedDays: number;
  litDots: number;
  savingsMinor: number;
  savingsRatio: number | null;
  savingsGoalMinor: number;
  savingsPercent: number;
  expenseComparison: string;
  balanceImproved: boolean;
  balanceChangeText: string;
  pendingCount: number;
};

export function buildHomeModel({
  overview,
  now,
  displayName,
  timeZone,
  locale = "en",
  reminderJobsCount,
  reminderBatchesCount,
  notificationCount,
}: {
  overview: StatisticsOverview;
  now: Date;
  displayName: string;
  timeZone: string;
  locale?: Locale;
  reminderJobsCount: number;
  reminderBatchesCount: number;
  notificationCount: number;
}): HomeModel {
  const t = translator(locale);
  const { summary } = overview;
  const visibleDailyTrend = overview.dailyTrend.slice(
    0,
    localDayOfMonth(now, timeZone),
  );

  const hour = localHour(now, timeZone);
  const sceneTime = sceneTimeFor(hour);
  const greeting = greetingFor(hour, locale);
  const firstName = displayName.trim().split(/\s+/)[0] ?? "";
  const greetingHeading = firstName
    ? `${greeting}${t(", ", "，")}${firstName}`
    : greeting;
  const companionMessage = companionLine(overview, locale);
  const monthNumber = Number(overview.month.slice(5));
  const dateHeading = `${dateLabel(now, timeZone, locale)} · ${monthLabel(monthNumber, locale)}`;

  // Tracking streak: dailyTrend contains posted transactions aggregated by day for this month;
  // after truncating at today, transactionCount > 0 is the number of active days.
  const checkedDays = visibleDailyTrend.filter(
    (day) => day.transactionCount > 0,
  ).length;
  const litDots = Math.min(checkedDays, STREAK_DAYS);

  // Monthly savings: balance / income, clamped to [0, 1]; income 0 shows placeholder text on mobile.
  const savingsMinor = summary.incomeMinor - summary.netExpenseMinor;
  const savingsRatio =
    summary.incomeMinor > 0
      ? Math.min(Math.max(savingsMinor / summary.incomeMinor, 0), 1)
      : null;
  const savingsPercent = Math.min(
    Math.max(Math.round((savingsMinor / SAVINGS_GOAL_MINOR) * 100), 0),
    100,
  );

  const expenseComparison =
    overview.changes.netExpense.ratePercent === null
      ? t(
          "Net spending last month: 0, No comparable previous month",
          "上月净支出为 0，暂无环比",
        )
      : overview.changes.netExpense.status === "unchanged"
        ? t("Net spending unchanged from last month", "净支出与上月持平")
        : t(
            `Net spending compared with last month: ${overview.changes.netExpense.status === "up" ? "increased" : "decreased"} ${Math.abs(overview.changes.netExpense.ratePercent)}%`,
            `净支出较上月${overview.changes.netExpense.status === "up" ? "增加" : "减少"} ${Math.abs(overview.changes.netExpense.ratePercent)}%`,
          );

  const balanceChange = overview.changes.balance;
  const balanceImproved =
    balanceChange.status === "up" ||
    balanceChange.status === "unchanged" ||
    balanceChange.ratePercent === null;
  const balanceChangeText = balanceChangeLabel(balanceChange, t);

  const pendingCount =
    reminderJobsCount + reminderBatchesCount + notificationCount;

  return {
    hour,
    sceneTime,
    greeting,
    firstName,
    greetingHeading,
    companionMessage,
    dateHeading,
    checkedDays,
    litDots,
    savingsMinor,
    savingsRatio,
    savingsGoalMinor: SAVINGS_GOAL_MINOR,
    savingsPercent,
    expenseComparison,
    balanceImproved,
    balanceChangeText,
    pendingCount,
  };
}
