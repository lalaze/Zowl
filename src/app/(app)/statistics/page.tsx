import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Info,
  Minus,
  ReceiptText,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import type { Metadata } from "next";

import {
  DailyTrendChart,
  MonthlyTrendChart,
  SpendingCompositionChart,
} from "@/components/statistics/statistics-charts";
import { OwlSays } from "@/components/brand/owl";
import { StatisticsPeriodFilter } from "@/components/statistics/statistics-period-filter";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { requireCurrentUserForRender } from "@/lib/auth/session";
import { localDayOfMonth } from "@/lib/date-time";
import {
  localeTag,
  translator,
  type Locale,
  type Translate,
} from "@/lib/i18n/locale";
import { getLocaleForRender, getTForRender } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import {
  getCurrentMonthInTimeZone,
  statisticsService,
  type MonthChange,
} from "@/services/statistics-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTForRender();
  return { title: t("Statistics", "统计") };
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function validMonth(value: string | undefined) {
  return Boolean(value && /^([1-9]\d{3})-(0[1-9]|1[0-2])$/.test(value));
}

function validCurrency(value: string | undefined) {
  return Boolean(value && /^[A-Z]{3}$/.test(value));
}

function ChangeLabel({
  change,
  t,
}: {
  change: MonthChange;
  t: Translate;
}) {
  const neutralClassName = "text-muted";

  if (change.status === "new") {
    return (
      <span className={`inline-flex items-center gap-1 ${neutralClassName}`}>
        <Minus className="size-3" />
        {t("Previous month: 0, No comparable previous month", "上月为 0，暂无环比")}
      </span>
    );
  }
  if (change.status === "unchanged") {
    return (
      <span className={`inline-flex items-center gap-1 ${neutralClassName}`}>
        <Minus className="size-3" />
        {t("Unchanged from last month", "与上月持平")}
      </span>
    );
  }

  const Icon = change.status === "up" ? ArrowUpRight : ArrowDownRight;
  const className = change.status === "up"
    ? "text-warn"
    : "text-income";

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Icon className="size-3" />
      {t(
        `vs. last month${change.status === "up" ? "increased" : "decreased"} ${Math.abs(change.ratePercent ?? 0)}%`,
        `较上月${change.status === "up" ? "增加" : "减少"} ${Math.abs(change.ratePercent ?? 0)}%`,
      )}
    </span>
  );
}

function FlowLegend({ t }: { t: Translate }) {
  return (
    <div aria-label={t("Legend", "图例")} className="flex flex-wrap items-center gap-3 text-xs font-semibold text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-[5px] border-2 border-divider bg-income" />
        {t("Income", "收入")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-[5px] border-2 border-divider bg-[var(--chart-neutral)]" />
        {t("Net spending", "净支出")}
      </span>
    </div>
  );
}

export default async function StatisticsPage({ searchParams }: PageProps) {
  const user = await requireCurrentUserForRender();
  const locale = await getLocaleForRender();
  const t = translator(locale);
  const params = await searchParams;
  const requestedMonth = first(params.month);
  const requestedCurrency = first(params.currency)?.toUpperCase();
  const now = new Date();
  const currentMonth = getCurrentMonthInTimeZone(now, user.timezone);
  const month = validMonth(requestedMonth) ? requestedMonth! : currentMonth;
  const currency = validCurrency(requestedCurrency) ? requestedCurrency! : "CNY";
  const overview = statisticsService.overview({
    userId: user.id,
    month,
    timeZone: user.timezone,
    currency,
  });
  const hasData = overview.summary.transactionCount > 0;
  // What the owl says: the top category (distribution is sorted by amount)
  // and the busiest day, matching the Zowl app.
  const topCategory = overview.categoryDistribution[0];
  const peak = overview.peakSpendingDay;
  const owlLines = [
    topCategory && topCategory.sharePercent > 0
      ? topCategory.sharePercent >= 40
        ? t(
            `${topCategory.name} accounts for ${topCategory.sharePercent}% of spending this month, your largest category.`,
            `本月「${topCategory.name}」占支出的 ${topCategory.sharePercent}%，是你最大的一类。`,
          )
        : t(
            `${topCategory.name} is your largest expense this month at ${topCategory.sharePercent}%.`,
            `本月支出最多的是「${topCategory.name}」，占 ${topCategory.sharePercent}%。`,
          )
      : null,
    peak ? peakSentence(peak, overview.currency, locale) : null,
  ].filter((line): line is string => Boolean(line));
  const currentDay =
    month === currentMonth ? localDayOfMonth(now, user.timezone) : null;
  const visibleDailyTrend =
    currentDay !== null
      ? overview.dailyTrend.slice(0, currentDay)
      : overview.dailyTrend;
  const periodNote =
    currentDay !== null
      ? t(`Through ${currentDay} Day`, `截至 ${currentDay} 日`)
      : t("Full calendar month", "完整自然月");

  return (
    <div className="space-y-4 sm:space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.65rem] font-black tracking-[-0.015em] text-foreground sm:text-[2rem]">
            {t("Insights", "统计")}
          </h1>
          <p className="sr-only">
            {t(
              `By ${user.timezone} calendar month; refunds offset spending and transfers are excluded.`,
              `按 ${user.timezone} 的自然月统计；退款抵扣支出，转账不计入收支。`,
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="lg:hidden">
            <ThemeSwitcher />
          </div>
          <StatisticsPeriodFilter
            currencies={overview.currencyBreakdown.map((item) => item.currency)}
            currency={currency}
            month={month}
          />
        </div>
      </header>

      {owlLines.length ? (
        <section aria-label={t("What the owl noticed", "猫头鹰的发现")}>
          <OwlSays owlClassName="size-14 sm:size-16">
            {owlLines.map((line) => (
              <span className="block" key={line}>
                {line}
              </span>
            ))}
          </OwlSays>
        </section>
      ) : null}

      {overview.excludedCurrencies.length ? (
        <div className="flex gap-3 rounded-[20px] border-2 border-divider bg-tint-amber p-4 text-sm text-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-bold">
              {t("Currencies are not combined", "不同币种不会相加")}
            </p>
            <p className="mt-1 text-muted">
              {t(
                `Totals currently include only ${currency}. Also recorded this month: `,
                `当前只汇总 ${currency}。本月另有 `,
              )}
              {overview.excludedCurrencies
                .map((item) =>
                  t(
                    `${item.currency} ${item.summary.transactionCount} transactions`,
                    `${item.currency} ${item.summary.transactionCount} 笔`,
                  ),
                )
                .join(t(", ", "、"))}
              {t(", View separately using the filters.", "，可通过筛选单独查看。")}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.35fr)] xl:items-stretch">
        <section
          aria-label={t("Monthly income and spending", "本月收支")}
          className="rounded-[24px] border-2 border-divider bg-tint-amber p-4 sm:p-6 xl:flex xl:min-h-[26rem] xl:flex-col"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-2xl border-2 border-divider bg-surface text-foreground sm:size-10">
              <WalletCards className="size-5" />
            </span>
            <p className="text-sm font-semibold text-muted">
              {t("Balance this month", "本月结余")}
            </p>
          </div>
          <div className="xl:my-auto">
            <p
              className="mt-3 text-[2.2rem] font-black tracking-[-0.01em] text-foreground tabular-nums sm:mt-5 sm:text-4xl"
            >
              {formatMoney(overview.summary.balanceMinor, currency)}
            </p>
            <p className="sr-only">
              {t("Income minus net spending", "收入减去净支出")}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:pt-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,0.9fr)_auto] xl:grid-cols-2">
            <div className="min-w-0 rounded-2xl border-2 border-divider bg-tint-leaf p-3.5">
              <p className="text-xs font-medium text-muted">{t("Income", "收入")}</p>
              <p
                className="mt-1 text-base font-black tabular-nums text-income sm:text-lg"
                data-testid="statistics-income-amount"
              >
                {formatMoney(overview.summary.incomeMinor, currency)}
              </p>
            </div>
            <div className="min-w-0 rounded-2xl border-2 border-divider bg-tint-sky p-3.5">
              <p className="text-xs font-medium text-muted">
                {t("Net spending", "净支出")}
              </p>
              <p
                className="mt-1 text-base font-black tabular-nums text-foreground sm:text-lg"
                data-testid="statistics-net-expense-amount"
              >
                {formatMoney(overview.summary.netExpenseMinor, currency)}
              </p>
            </div>
            <div className="col-span-2 flex items-center pt-1 md:col-span-1 md:pl-2 md:pt-0 xl:col-span-2 xl:pl-0 xl:pt-1">
              <span className="max-w-full text-xs font-medium text-muted whitespace-nowrap">
                <ChangeLabel change={overview.changes.netExpense} t={t} />
              </span>
            </div>
          </div>
        </section>

        {hasData ? (
          <section className="rounded-[24px] border-2 border-divider bg-surface p-4 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-black tracking-[-0.01em] text-foreground">
                  {t("Daily income and spending", "每日收支")}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {t("Aggregated by local calendar day · ", "按本地自然日汇总 · ")}
                  {periodNote}
                </p>
              </div>
              <FlowLegend t={t} />
            </div>
            <div className="mt-2 sm:mt-4">
              <DailyTrendChart data={visibleDailyTrend} currency={currency} />
            </div>
          </section>
        ) : (
          <section className="grid min-h-56 place-items-center rounded-[24px] border-2 border-divider bg-surface p-8 text-center">
            <div>
              <p className="font-bold text-foreground">
                {t(
                  `No records this month for ${currency} Transactions`,
                  `本月还没有 ${currency} 交易`,
                )}
              </p>
              <p className="mt-2 text-sm text-muted">
                {t(
                  "Change the month or currency, or add or import a transaction.",
                  "换个月份或币种，或者先记一笔、导入交易。",
                )}
              </p>
            </div>
          </section>
        )}
      </div>

      {hasData ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <section className="rounded-[24px] border-2 border-divider bg-surface p-5 sm:p-6">
              <div>
                <h2 className="text-xl font-black tracking-[-0.01em] text-foreground">
                  {t("Spending breakdown", "支出构成")}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {t(
                    "Switch between categories and payment sources using the same totals",
                    "在分类和支付来源之间切换，金额口径保持一致",
                  )}
                </p>
              </div>
              <div className="mt-4">
                <SpendingCompositionChart
                  categories={overview.categoryDistribution}
                  currency={currency}
                  month={month}
                  sources={overview.sourceDistribution}
                />
              </div>
            </section>

            <section
              className="rounded-[24px] border-2 border-divider bg-surface p-5 sm:p-6 xl:flex xl:flex-col"
              data-testid="statistics-monthly-trend-card"
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black tracking-[-0.01em] text-foreground">
                    {t("Six-month trend", "近六个月趋势")}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {t(
                      "Monthly comparison within one currency; no exchange conversion",
                      "同一币种按月对比，不做汇率换算",
                    )}
                  </p>
                </div>
                <FlowLegend t={t} />
              </div>
              <div className="mt-4 xl:min-h-0 xl:flex-1">
                <MonthlyTrendChart
                  currency={currency}
                  data={overview.monthlyTrend}
                />
              </div>
            </section>
          </div>

          <details className="group rounded-[24px] border-2 border-divider bg-surface">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-foreground [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <Info className="size-4 text-accent-text" />
                {t("Calculation details and additional amounts", "统计口径和补充金额")}
              </span>
              <span className="text-xs font-medium text-subtle group-open:hidden">
                {t("Expand", "展开")}
              </span>
              <span className="hidden text-xs font-medium text-subtle group-open:inline">
                {t("Collapse", "收起")}
              </span>
            </summary>
            <div className="grid gap-3 border-t-2 border-divider p-4 text-sm sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-2xl border-2 border-divider bg-surface-muted p-3">
                <ReceiptText className="size-4 text-muted" />
                <span>
                  <span className="block text-xs text-muted">{t("Gross spending", "消费支出")}</span>
                  <span className="font-bold tabular-nums text-foreground">
                    {formatMoney(overview.summary.grossExpenseMinor, currency)}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border-2 border-divider bg-tint-leaf p-3">
                <RotateCcw className="size-4 text-income" />
                <span>
                  <span className="block text-xs text-income">{t("Refund offset", "退款抵扣")}</span>
                  <span className="font-bold tabular-nums text-foreground">
                    {formatMoney(overview.summary.refundMinor, currency)}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border-2 border-divider bg-tint-sky p-3">
                <ArrowLeftRight className="size-4 text-foreground" />
                <span>
                  <span className="block text-xs text-muted">
                    {t(
                      "Transfers (excluded from income and spending)",
                      "转账（不计入收支）",
                    )}
                  </span>
                  <span className="font-bold tabular-nums text-foreground">
                    {formatMoney(overview.summary.transferMinor, currency)}
                  </span>
                </span>
              </div>
              <p className="text-xs leading-5 text-muted sm:col-span-3">
                {t(
                  `Statistics use ${user.timezone} calendar months; refunds offset spending, and transfers do not affect income, spending, or balance.`,
                  `统计按 ${user.timezone} 的自然月计算；退款抵扣消费支出，转账不计入收入、支出或结余。`,
                )}
              </p>
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}

function peakSentence(
  peak: NonNullable<ReturnType<typeof statisticsService.overview>["peakSpendingDay"]>,
  currency: string,
  locale: Locale,
) {
  const t = translator(locale);
  const [year, month, day] = peak.date.split("-").map(Number);
  const label = new Intl.DateTimeFormat(localeTag(locale), {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
  const total = formatMoney(peak.netExpenseMinor, currency);
  const merchant = peak.topExpense?.merchantName?.trim();
  if (!merchant) {
    return t(`Biggest day: ${label}, ${total}.`, `花得最多的一天：${label}，共 ${total}。`);
  }
  if (peak.expenseCount < 2) {
    return t(
      `Biggest day: ${label}, ${total} at ${merchant}.`,
      `花得最多的一天：${label}，在「${merchant}」花了 ${total}。`,
    );
  }
  const largest = formatMoney(peak.topExpense!.amountMinor, currency);
  return t(
    `Biggest day: ${label}, ${total}, largest at ${merchant} (${largest}).`,
    `花得最多的一天：${label}，共 ${total}，最大一笔在「${merchant}」（${largest}）。`,
  );
}
