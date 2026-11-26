import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  FileSpreadsheet,
  Flame,
  PiggyBank,
  ReceiptText,
  ScanLine,
} from "lucide-react";
import Link from "next/link";

import {
  StoryScene,
  greetingFor,
  localHour,
  sceneTimeFor,
} from "@/components/brand/story-scene";
import { CategoryGlyph } from "@/components/categories/category-glyph";
import { companionLine } from "@/components/home/owl-companion";
import { ReviewReminderCard } from "@/components/home/review-reminder-card";
import { DesktopDashboard } from "@/components/home/desktop-dashboard";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { QuickTransactionEntry } from "@/components/transactions/quick-transaction-entry";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { transactionTitle } from "@/lib/order-details";
import { requireCurrentUser } from "@/lib/auth/session";
import { translator } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { formatMoney, formatSignedMoney } from "@/lib/money";
import { formatTransactionDate, isIncoming } from "@/lib/transaction-display";
import { importService } from "@/services/import-service";
import { notificationCaptureService } from "@/services/notification-capture-service";
import { screenshotRecognitionService } from "@/services/screenshot-recognition-service";
import {
  getCurrentMonthInTimeZone,
  statisticsService,
} from "@/services/statistics-service";
import { transactionService } from "@/services/transaction-service";

function localDayOfMonth(now: Date, timeZone: string) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      timeZone,
    }).format(now),
  );
}

const STREAK_DAYS = 21;

/** Recent transaction icon badge pastel background rotation */
const TRANSACTION_BADGE_BACKGROUNDS = [
  "bg-tint-amber",
  "bg-tint-sky",
  "bg-tint-leaf",
] as const;

export default async function HomePage() {
  const user = await requireCurrentUser();
  const locale = await getLocale();
  const t = translator(locale);
  const now = new Date();
  const month = getCurrentMonthInTimeZone(now, user.timezone);
  const overview = statisticsService.overview({
    userId: user.id,
    month,
    timeZone: user.timezone,
    currency: "CNY",
  });
  const categories = transactionService.listCategories(user.id);
  const recognitionProvider = screenshotRecognitionService.providerInfo();
  // Screenshot jobs and import batches still awaiting review (not yet posted).
  const reviewingBatches = importService
    .listBatches(user.id)
    .filter((batch) => batch.status === "reviewing")
    .map((batch) => ({ id: batch.id, count: batch.totalCount }));
  const reviewingJobs = screenshotRecognitionService
    .pendingJobs(user.id)
    .filter((job) => job.status === "reviewing")
    .map((job) => ({ id: job.id, count: job.totalCount }));
  // Payment notifications captured on the phone and awaiting confirmation.
  const notificationCount = notificationCaptureService.list(user.id, {
    limit: 1,
  }).pendingCount;
  // Recent entries seed merchant templates in quick entry.
  const recentTransactions = transactionService.list(user.id, 20);
  const items = overview.recentTransactions;
  const { summary } = overview;
  const visibleDailyTrend = overview.dailyTrend.slice(
    0,
    localDayOfMonth(now, user.timezone),
  );
  const expenseComparison = overview.changes.netExpense.ratePercent === null
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

  const hour = localHour(now, user.timezone);
  const greeting = greetingFor(hour, locale);
  const firstName = user.displayName.trim().split(/\s+/)[0] ?? "";

  // Tracking streak:dailyTrend contains posted transactions aggregated by day for this month;
  // after truncating at today,transactionCount > 0 is the number of active days
  const checkedDays = visibleDailyTrend.filter(
    (day) => day.transactionCount > 0,
  ).length;
  const litDots = Math.min(checkedDays, STREAK_DAYS);

  // Monthly savings: balance / income,clamp to [0, 1]; income is 0 shows placeholder text
  const savingsMinor = summary.incomeMinor - summary.netExpenseMinor;
  const savingsRatio = summary.incomeMinor > 0
    ? Math.min(Math.max(savingsMinor / summary.incomeMinor, 0), 1)
    : null;

  return (
    <>
      <DesktopDashboard
        categories={categories}
        checkedDays={checkedDays}
        litDots={litDots}
        now={now}
        overview={overview}
        recognitionProvider={recognitionProvider}
        notificationCount={notificationCount}
        recentTransactions={recentTransactions}
        reminderBatches={reviewingBatches}
        reminderJobs={reviewingJobs}
        user={user}
        locale={locale}
      />
      <div className="lg:hidden">
      <StoryScene
        className="-mt-2 rounded-b-[36px] px-5 pb-16 pt-5 sm:-mt-8 sm:rounded-[36px]"
        time={sceneTimeFor(hour)}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-lg font-black">Zowl</span>
          <ThemeSwitcher className="bg-white/85 text-[#1f2230]" />
        </div>
        <div className="mt-4 max-w-[64%]">
          <h1 className="text-[1.6rem] font-black leading-tight">
            {firstName ? `${greeting}${t(", ", "，")}${firstName}` : greeting}
          </h1>
          <p className="scene-muted mt-1.5 text-sm font-bold leading-snug">
            {companionLine(overview, locale)}
          </p>
        </div>
      </StoryScene>

      <div className="relative -mt-8 space-y-5 px-4 sm:px-0">
      <Card className="p-6 sm:p-8">
        <p className="text-sm font-bold text-muted">{t("Balance this month", "本月结余")}</p>
        <p className="mt-2 text-[clamp(2.35rem,7vw,3.5rem)] font-black leading-none tracking-[-0.01em] text-foreground tabular-nums">
          {formatMoney(summary.balanceMinor)}
        </p>
        <p className="mt-3 max-w-md text-xs font-semibold text-muted sm:text-sm">
          {expenseComparison}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="min-w-0 rounded-[18px] bg-surface-muted px-4 py-3">
            <span className="flex items-center gap-1.5 text-xs font-bold text-muted">
              <ArrowDownLeft className="size-3.5 text-income" />
              {t("Income", "收入")}
            </span>
            <span
              className="mt-1 block truncate text-lg font-black text-income tabular-nums sm:text-xl"
              data-testid="home-income-amount"
            >
              {formatMoney(summary.incomeMinor)}
            </span>
          </div>
          <div className="min-w-0 rounded-[18px] bg-surface-muted px-4 py-3">
            <span className="flex items-center gap-1.5 text-xs font-bold text-muted">
              <ArrowUpRight className="size-3.5 text-accent-text" />
              {t("Spending", "支出")}
            </span>
            <span className="mt-1 block truncate text-lg font-black text-foreground tabular-nums sm:text-xl">
              {formatMoney(summary.netExpenseMinor)}
            </span>
          </div>
        </div>
      </Card>

      {overview.excludedCurrencies.length ? (
        <p className="rounded-2xl border-2 border-divider bg-tint-sky px-4 py-3 text-xs font-semibold text-muted">
          {t("Home totals include only CNY; Also ", "首页金额仅汇总 CNY；另有 ")}
          {overview.excludedCurrencies
            .map((item) =>
              t(
                `${item.currency} ${item.summary.transactionCount} transactions`,
                `${item.currency} ${item.summary.transactionCount} 笔`,
              ),
            )
            .join(t(", ", "、"))}
          {t(
            ", View other currencies separately in Statistics.",
            "，请到统计页单独查看。",
          )}
        </p>
      ) : null}

      {/* Quick actions：D 方向三枚彩色徽章按钮 */}
      <section>
        <h2 className="sr-only">{t("Quick actions", "快捷操作")}</h2>
        <div className="grid grid-cols-3 gap-3">
          <QuickTransactionEntry
            categories={categories}
            recentTransactions={recentTransactions}
            recognitionProvider={recognitionProvider}
            triggerLayout="badge"
            triggerClassName="h-auto w-full flex-col gap-2 rounded-[20px] bg-surface px-2 py-4 text-sm text-foreground hover:bg-surface-muted"
          />
          <Link
            href="/imports/screenshots"
            className="flex h-auto flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-divider bg-surface px-2 py-4 text-sm font-extrabold text-foreground outline-none transition hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-divider bg-tint-sky text-foreground">
              <ScanLine className="size-5" />
            </span>
            {t("Screenshots", "截图")}
          </Link>
          <Link
            href="/imports/files"
            className="flex h-auto flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-divider bg-surface px-2 py-4 text-sm font-extrabold text-foreground outline-none transition hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-divider bg-tint-leaf text-foreground">
              <FileSpreadsheet className="size-5" />
            </span>
            {t("Import file", "导入账单")}
          </Link>
        </div>
      </section>

      <ReviewReminderCard
        importBatches={reviewingBatches}
        notificationCount={notificationCount}
        screenshotJobs={reviewingJobs}
        locale={locale}
      />

      {/* 游戏化：连续记账 + 本月存钱罐 */}
      <section className="grid gap-4 sm:grid-cols-2 lg:gap-5">
        <Card className="flex items-center gap-4 p-5">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl border-2 border-divider bg-tint-amber text-foreground">
            <Flame className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-black text-foreground">
              {t("Tracking streak", "连续记账")}
              <span className="text-xs font-extrabold text-accent-text">
                {t(
                  `Completed ${litDots} / ${STREAK_DAYS}`,
                  `已点亮 ${litDots} / ${STREAK_DAYS}`,
                )}
              </span>
            </p>
            <div
              aria-label={t(
                `This month: ${checkedDays} days with transactions, lighting up ${litDots} dots`,
                `本月已有 ${checkedDays} 天记账，点亮了 ${litDots} 个圆点`,
              )}
              className="mt-2.5 grid grid-cols-[repeat(21,minmax(0,1fr))] gap-[5px]"
              role="img"
            >
              {Array.from({ length: STREAK_DAYS }, (_, index) => (
                <span
                  key={index}
                  className={`aspect-square w-full max-w-2.5 rounded-full border-2 border-divider ${index < litDots ? "bg-primary" : "bg-surface"}`}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] font-semibold text-muted">
              {checkedDays === 0
                ? t(
                    "Record a transaction today to light up your first dot!",
                    "今天记一笔，点亮第一个圆点！",
                  )
                : litDots < STREAK_DAYS
                  ? t(
                      `Record another ${STREAK_DAYS - litDots} days to complete this month`,
                      `再记 ${STREAK_DAYS - litDots} 天，就能集满本月打卡`,
                    )
                  : t(
                      "All tracking days complete this month. Well done!",
                      "本月打卡已集满，太棒了！",
                    )}
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-4 p-5">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl border-2 border-divider bg-tint-sky text-foreground">
            <PiggyBank className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-black text-foreground">
              {t("Balance this month", "本月结余")}
              <span className="text-[11px] font-semibold text-muted">
                {t("Balance = Income − Expense", "结余 = 收入 − 支出")}
              </span>
            </p>
            {savingsRatio === null ? (
              <p className="mt-2.5 text-xs font-semibold text-muted">
                {t(
                  "No income recorded this month. Add income to start saving!",
                  "本月还没有收入记录，记一笔收入就能开始攒钱！",
                )}
              </p>
            ) : (
              <>
                <div className="mt-2.5 flex items-center gap-2.5">
                  <div className="h-5 flex-1 overflow-hidden rounded-full border-2 border-divider bg-surface">
                    <div
                      className="h-full rounded-r-full border-r-2 border-divider"
                      style={{
                        width: `${Math.round(savingsRatio * 100)}%`,
                        background:
                          "repeating-linear-gradient(45deg, var(--income) 0 8px, var(--tint-leaf) 8px 16px)",
                      }}
                    />
                  </div>
                  <span className="shrink-0 text-sm font-black text-income tabular-nums">
                    {Math.round(savingsRatio * 100)}%
                  </span>
                </div>
                <p className="mt-2 text-[11px] font-semibold text-muted">
                  {savingsMinor < 0
                    ? t(
                        "Spending exceeded income this month. Keep tracking to get back on course!",
                        "本月支出超过了收入，坚持记账，慢慢找回节奏！",
                      )
                    : t(
                        `Saved ${formatMoney(savingsMinor)} / Income ${formatMoney(summary.incomeMinor)}, Every entry helps your savings grow!`,
                        `已存 ${formatMoney(savingsMinor)} / 收入 ${formatMoney(summary.incomeMinor)}，每记一笔，积蓄就多一分！`,
                      )}
                </p>
              </>
            )}
          </div>
        </Card>
      </section>

      {/* Bottom: recent transactions */}
      <div className="pb-6">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black tracking-[-0.01em] text-foreground lg:text-2xl">
                {t("Recent transactions", "最近交易")}
              </h2>
              <p className="mt-1 text-sm font-medium text-muted">
                {t(
                  `Most recent ${Math.min(items.length, 5)} transactions`,
                  `最近记录的 ${Math.min(items.length, 5)} 笔交易`,
                )}
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/transactions">
                {t("View all", "查看全部")}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <Card className="overflow-hidden">
            {items.length ? (
              items.slice(0, 5).map((item, index) => (
                <Link
                  key={item.id}
                  href={`/transactions/${item.id}`}
                  className={`group flex items-center justify-between gap-4 px-4 py-3.5 transition hover:bg-surface-muted sm:px-5 ${index ? "border-t-2 border-divider" : ""}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`grid size-11 shrink-0 place-items-center rounded-2xl border-2 border-divider text-foreground ${TRANSACTION_BADGE_BACKGROUNDS[index % TRANSACTION_BADGE_BACKGROUNDS.length]}`}
                    >
                      <CategoryGlyph
                        name={item.categoryIcon}
                        className="size-5"
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-foreground sm:text-base">
                        {transactionTitle(item) ??
                          t("Untitled transaction", "未命名交易")}
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-medium text-muted">
                        {item.categoryName ?? t("Uncategorized", "未分类")} ·{" "}
                        {formatTransactionDate(item.transactionTime, false, locale)}
                      </span>
                    </span>
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className={`text-sm font-black tabular-nums sm:text-base ${isIncoming(item.type) ? "text-income" : "text-expense"}`}
                    >
                      {formatSignedMoney(
                        item.amountMinor,
                        isIncoming(item.type) ? "+" : "-",
                        item.currency,
                      )}
                    </span>
                    <ChevronRight className="hidden size-5 text-muted transition group-hover:translate-x-0.5 lg:block" />
                  </span>
                </Link>
              ))
            ) : (
              <div className="p-8 text-center text-sm font-medium text-muted">
                <ReceiptText className="mx-auto mb-3 size-6 text-subtle" />
                {t("No transactions yet. Add your first one.", "还没有交易，先记一笔吧。")}
              </div>
            )}
          </Card>
        </section>
      </div>
      </div>
      </div>
    </>
  );
}
