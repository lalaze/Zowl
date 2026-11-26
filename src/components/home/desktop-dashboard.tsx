import {
  BellRing,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileSpreadsheet,
  Flame,
  PiggyBank,
  ScanLine,
  Search,
  TrendingUp,
  Upload,
  WalletCards,
} from "lucide-react";
import Link from "next/link";

import { Owl } from "@/components/brand/owl";
import {
  StoryScene,
  greetingFor,
  localHour,
  sceneTimeFor,
} from "@/components/brand/story-scene";
import { companionLine } from "@/components/home/owl-companion";
import { CategoryGlyph } from "@/components/categories/category-glyph";
import type { ReminderItem } from "@/components/home/review-reminder-card";
import {
  DesktopHomeExpenseDonut,
  DesktopHomeMonthlyCashflowTrend,
} from "@/components/statistics/desktop-home-charts";
import type { QuickScreenshotProviderInfo } from "@/components/transactions/quick-screenshot-entry";
import { QuickTransactionEntry } from "@/components/transactions/quick-transaction-entry";
import type { TransactionCategoryOption } from "@/components/transactions/transaction-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { transactionTitle } from "@/lib/order-details";
import type { SessionUser } from "@/lib/auth/session";
import {
  localeTag,
  translator,
  type Locale,
  type Translate,
} from "@/lib/i18n/locale";
import { formatMoney, formatSignedMoney } from "@/lib/money";
import {
  formatTransactionDate,
  isIncoming,
} from "@/lib/transaction-display";
import type { StatisticsOverview } from "@/services/statistics-service";
import type { TransactionView } from "@/types/transaction";

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

/** Tinted sticker tile in the category's own colour. */
function categoryTile(color: string | null | undefined) {
  const tint = color ?? "#8b93a1";
  return {
    backgroundColor: `color-mix(in srgb, ${tint} 14%, var(--app-surface))`,
    color: tint,
  };
}

function dateLabel(now: Date, timeZone: string, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric", month: "long", year: "numeric", timeZone,
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

export function DesktopDashboard({
  categories,
  checkedDays,
  litDots,
  now,
  overview,
  notificationCount,
  recentTransactions,
  recognitionProvider,
  reminderBatches,
  reminderJobs,
  user,
  locale = "en",
}: {
  categories: TransactionCategoryOption[];
  checkedDays: number;
  litDots: number;
  now: Date;
  overview: StatisticsOverview;
  notificationCount: number;
  recentTransactions: TransactionView[];
  recognitionProvider: QuickScreenshotProviderInfo;
  reminderBatches: ReminderItem[];
  reminderJobs: ReminderItem[];
  user: SessionUser;
  locale?: Locale;
}) {
  const t = translator(locale);
  const { summary } = overview;
  const pendingCount =
    reminderJobs.length + reminderBatches.length + notificationCount;
  const monthNumber = Number(overview.month.slice(5));
  const items = overview.recentTransactions;
  const savingsMinor = summary.incomeMinor - summary.netExpenseMinor;
  const savingsGoalMinor = 1_000_000;
  const savingsPercent = Math.min(
    Math.max(Math.round((savingsMinor / savingsGoalMinor) * 100), 0),
    100,
  );
  const balanceChange = overview.changes.balance;
  const balanceImproved =
    balanceChange.status === "up" ||
    balanceChange.status === "unchanged" ||
    balanceChange.ratePercent === null;
  const hour = localHour(now, user.timezone);
  const firstName = user.displayName.trim().split(/\s+/)[0] ?? "";
  const greeting = greetingFor(hour, locale);

  return (
    <div className="hidden h-dvh min-h-[760px] flex-col gap-4 overflow-hidden px-6 pb-5 pt-5 lg:flex">
      <StoryScene
        className="h-[150px] shrink-0 rounded-[32px] px-7 pt-5 [--owl-size:104px]"
        time={sceneTimeFor(hour)}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 max-w-[46%] flex-1">
            <p className="scene-muted text-[12px] font-bold">
              {dateLabel(now, user.timezone, locale)} · {monthLabel(monthNumber, locale)}
            </p>
            <h1 className="mt-1 text-[28px] font-black leading-tight tracking-[-0.01em]">
              {firstName ? `${greeting}${t(", ", "，")}${firstName}` : greeting}
            </h1>
            <p className="scene-muted mt-1 truncate text-[13px] font-bold">
              {companionLine(overview, locale)}
            </p>
          </div>

          <form
            action="/transactions"
            className="relative mr-[25%] w-[200px] shrink-0"
            method="get"
            role="search"
          >
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              aria-label={t("Search transactions", "搜索交易")}
              className="h-10 w-full rounded-[16px] bg-surface/95 pl-10 pr-4 text-[12px] font-bold text-foreground outline-none placeholder:text-muted focus:ring-2 focus:ring-primary"
              name="keyword"
              placeholder={t("Search transactions…", "搜索交易…")}
              type="search"
            />
          </form>
        </div>
        <div className="mt-3 flex gap-2">
          <QuickTransactionEntry
            categories={categories}
            recentTransactions={recentTransactions}
            recognitionProvider={recognitionProvider}
            triggerClassName="h-10 rounded-[16px] px-5 text-[13px] [&_kbd]:hidden"
          />
          <Button
            asChild
            className="h-10 rounded-[16px] bg-surface/95 px-4 text-[13px] text-foreground hover:bg-surface"
            variant="outline"
          >
            <Link href="/imports/files">
              <Upload className="size-4" />
              {t("Import statements", "导入账单")}
            </Link>
          </Button>
        </div>
      </StoryScene>

      <section className="grid h-[248px] shrink-0 grid-cols-[1.04fr_1.12fr_.88fr] gap-4">
        <Card className="relative h-full overflow-hidden p-5">
          <p className="flex items-center gap-2 text-[12px] font-black text-muted">
            <WalletCards className="size-4" />
            {t("Net balance this month", "本月结余")}
          </p>
          <p className="mt-3 text-[34px] font-black leading-none tracking-[-0.01em] text-foreground tabular-nums">
            {formatMoney(summary.balanceMinor)}
          </p>
          <span
            className={`mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-black ${
              balanceImproved
                ? "bg-tint-leaf text-income"
                : "bg-tint-berry text-danger"
            }`}
          >
            {balanceChangeLabel(balanceChange, t)}
          </span>

          <div className="absolute bottom-5 left-5 right-5 grid grid-cols-2 gap-3">
            <div className="rounded-[16px] bg-surface-muted px-3.5 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
                <span className="size-2 rounded-full bg-income" />
                {t("Income this month", "本月收入")}
              </p>
              <p className="mt-1 text-[17px] font-black text-income tabular-nums">
                {formatMoney(summary.incomeMinor)}
              </p>
            </div>
            <div className="rounded-[16px] bg-surface-muted px-3.5 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
                <span className="size-2 rounded-full bg-primary" />
                {t("Spending this month", "本月支出")}
              </p>
              <p className="mt-1 text-[17px] font-black text-expense tabular-nums">
                {formatMoney(summary.netExpenseMinor)}
              </p>
            </div>
          </div>

        </Card>

        <Card className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="flex h-[50px] shrink-0 items-center px-5 pt-1">
            <TrendingUp className="size-4" />
            <h2 className="ml-auto text-[13px] font-black text-foreground">
              {t("Cash flow · Last 6 months", "收支 · 近 6 个月")}
            </h2>
            <div className="ml-3 flex items-center gap-3 text-[10px] font-bold text-muted">
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-income" />
                {t("Income", "收入")}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-[var(--chart-expense)]" />
                {t("Expense", "支出")}
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1 px-3 pb-3">
            <DesktopHomeMonthlyCashflowTrend
              currency={overview.currency}
              data={overview.monthlyTrend}
            />
          </div>
        </Card>

        <Card className="flex h-full min-h-0 flex-col overflow-hidden p-5">
          <h2 className="flex items-center gap-2 text-[13px] font-black text-foreground">
            <Clock3 className="size-4" />
            {t("Spending breakdown · This month", "支出构成 · 本月")}
          </h2>
          <div className="min-h-0 flex-1">
            <DesktopHomeExpenseDonut
              currency={overview.currency}
              data={overview.categoryDistribution}
              totalMinor={summary.netExpenseMinor}
            />
          </div>
        </Card>
      </section>

      <section className="grid h-[109px] shrink-0 grid-cols-[1.14fr_1fr] gap-4">
        <Card className="flex h-full items-center gap-4 px-6 py-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-tint-amber">
            <Flame className="size-6 fill-primary text-accent-text" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2 text-[13px] font-black text-foreground">
              {t(
                `Tracking streak ${checkedDays} days`,
                `连续记账 ${checkedDays} 天`,
              )}
              <span className="text-[10px] text-accent-text">
                {t(`Completed ${litDots} / 21`, `已点亮 ${litDots} / 21`)}
              </span>
            </p>
            <div
              aria-label={t(
                `Light up ${litDots} tracking streak dots`,
                `已点亮 ${litDots} 个记账圆点`,
              )}
              className="mt-2 flex items-center gap-[6px]"
              role="img"
            >
              {Array.from({ length: 21 }, (_, index) => (
                <span
                  className={`size-3 rounded-full ${
                    index < litDots ? "bg-primary" : "bg-surface-strong"
                  } ${index === litDots ? "ring-4 ring-tint-amber" : ""}`}
                  key={index}
                />
              ))}
            </div>
            <p className="mt-2 text-[10px] font-bold text-muted">
              {litDots < 21
                ? t(
                    `Keep going for ${21 - litDots} days to unlock the Tracking Star badge`,
                    `再坚持 ${21 - litDots} 天，解锁「记账之星」徽章`,
                  )
                : t(
                    "All tracking days complete this month. Well done!",
                    "本月打卡已集满，太棒了！",
                  )}
            </p>
          </div>
        </Card>

        <Card className="flex h-full items-center gap-4 px-6 py-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-tint-leaf">
            <PiggyBank className="size-6 text-income" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-black text-foreground">
              {t("Monthly savings", "本月储蓄")}{" "}
              <span className="text-[12px] tabular-nums">
                {formatMoney(Math.max(savingsMinor, 0))}
              </span>
              <span className="ml-1 text-[10px] text-muted">
                {t("/ Goal ", "/ 目标 ")}
                {formatMoney(savingsGoalMinor)}
              </span>
            </p>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-strong">
                <div
                  className="h-full rounded-full bg-income"
                  style={{ width: `${savingsPercent}%` }}
                />
              </div>
              <span className="text-[13px] font-black text-income tabular-nums">
                {savingsPercent}%
              </span>
            </div>
            <p className="mt-1 text-[10px] font-bold text-muted">
              {t("Every entry helps your savings grow!", "每记一笔，积蓄就多一分！")}
            </p>
          </div>
        </Card>
      </section>

      <section className="grid min-h-0 flex-1 grid-cols-[1.12fr_1fr] gap-4">
        <Card className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="flex h-[47px] shrink-0 items-center gap-2 px-5">
            <Clock3 className="size-4" />
            <h2 className="text-[13px] font-black text-foreground">
              {t("Recent transactions", "最近交易")}
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-5">
            {items.length ? (
              items.map((item) => (
                <Link
                  className="-mx-2 flex h-[54px] items-center gap-3 rounded-[16px] px-2 transition hover:bg-surface-muted"
                  href={`/transactions/${item.id}`}
                  key={item.id}
                >
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-[12px]"
                    style={categoryTile(item.categoryColor)}
                  >
                    <CategoryGlyph
                      className="size-4"
                      name={item.categoryIcon}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-black text-foreground">
                      {transactionTitle(item) ??
                        t("Untitled transaction", "未命名交易")}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] font-bold text-muted">
                      {formatTransactionDate(item.transactionTime, false, locale)} ·{" "}
                      {item.categoryName ?? t("Uncategorized", "未分类")}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-[12px] font-black tabular-nums ${
                      isIncoming(item.type) ? "text-income" : "text-foreground"
                    }`}
                  >
                    {formatSignedMoney(
                      item.amountMinor,
                      isIncoming(item.type) ? "+" : "-",
                      item.currency,
                    )}
                  </span>
                </Link>
              ))
            ) : (
              <div className="grid h-full place-content-center text-center text-xs font-bold text-muted">
                {t("No transactions yet", "还没有交易")}
              </div>
            )}
          </div>
          <Link
            className="grid h-[38px] shrink-0 place-items-center text-[10px] font-black text-muted transition hover:text-accent-text"
            href="/transactions"
          >
            {t(
              `View all ${summary.transactionCount} transactions >`,
              `查看全部 ${summary.transactionCount} 笔交易 >`,
            )}
          </Link>
        </Card>

        <Card className="flex h-full min-h-0 flex-col overflow-hidden px-5 pb-5 pt-3">
          <div className="flex shrink-0 items-center gap-2">
            <Owl className="size-7" />
            <h2 className="text-[13px] font-black text-foreground">
              {t("To review", "待核对")}
            </h2>
            <span className="ml-auto rounded-full bg-tint-leaf px-2.5 py-0.5 text-[10px] font-black text-income">
              {pendingCount
                ? t(
                    `${pendingCount} ${pendingCount === 1 ? "item" : "items"} awaiting review`,
                    `${pendingCount} 项待核对`,
                  )
                : t("Nothing pending", "暂无待办")}
            </span>
          </div>

          <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto">
            {pendingCount ? (
              <>
                {notificationCount ? (
                  <Link
                    className="flex h-[60px] items-center gap-3 rounded-[18px] bg-tint-berry px-3 transition hover:brightness-[0.98]"
                    href="/imports/notifications"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-surface text-foreground">
                      <BellRing className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-black text-foreground">
                        {t("Payment notifications awaiting review", "支付通知待核对")}
                      </span>
                      <span className="mt-1 block truncate text-[9px] font-bold text-muted">
                        {t(
                          `${notificationCount} captured · Review inbox`,
                          `已采集 ${notificationCount} 条 · 待核对`,
                        )}
                      </span>
                    </span>
                    <ChevronRight className="size-3.5 shrink-0 text-muted" />
                  </Link>
                ) : null}
                {reminderJobs.slice(0, 2).map((job) => (
                  <Link
                    className="flex h-[60px] items-center gap-3 rounded-[18px] bg-tint-sky px-3 transition hover:brightness-[0.98]"
                    href={`/imports/screenshots/${job.id}/review`}
                    key={`job-${job.id}`}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-surface text-foreground">
                      <ScanLine className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-black text-foreground">
                        {t("Screenshots awaiting review", "截图待核对")}
                      </span>
                      <span className="mt-1 block truncate text-[9px] font-bold text-muted">
                        {t(
                          `${job.count} screenshots · Confirm before posting`,
                          `${job.count} 张截图 · 确认后入账`,
                        )}
                      </span>
                    </span>
                    <ChevronRight className="size-3.5 shrink-0 text-muted" />
                  </Link>
                ))}
                {reminderBatches.slice(0, 2).map((batch) => (
                  <Link
                    className="flex h-[60px] items-center gap-3 rounded-[18px] bg-tint-amber px-3 transition hover:brightness-[0.98]"
                    href={`/imports/files/${batch.id}/review`}
                    key={`batch-${batch.id}`}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-surface text-foreground">
                      <FileSpreadsheet className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-black text-foreground">
                        {t("Import batch awaiting review", "导入批次待核对")}
                      </span>
                      <span className="mt-1 block truncate text-[9px] font-bold text-muted">
                        {t(
                          `${batch.count} records · Confirm before posting`,
                          `${batch.count} 条记录 · 确认后入账`,
                        )}
                      </span>
                    </span>
                    <ChevronRight className="size-3.5 shrink-0 text-muted" />
                  </Link>
                ))}
              </>
            ) : (
              <div className="grid h-full place-content-center justify-items-center gap-1 text-center">
                <Owl className="mb-1 size-14" />
                <p className="text-[12px] font-black text-foreground">
                  {t("Nothing awaiting review", "没有待核对的内容")}
                </p>
                <p className="text-[9px] font-bold text-muted">
                  {t("Your ledger is up to date", "账本已是最新")}
                </p>
              </div>
            )}
          </div>

          <Button
            asChild
            className="mt-3 h-10 w-full shrink-0 rounded-[14px] text-[13px]"
          >
            <Link href="/imports">
              <CircleDollarSign className="size-4" />
              {t("View imports", "查看导入")}
            </Link>
          </Button>
          <p className="mt-2 shrink-0 text-center text-[9px] font-bold text-muted">
            {t(
              "Every candidate requires confirmation before posting",
              "每条候选都需确认后才会入账",
            )}
          </p>
        </Card>
      </section>
    </div>
  );
}
