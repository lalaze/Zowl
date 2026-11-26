import type { ReminderItem } from "@/components/home/review-reminder-card";
import type { QuickScreenshotProviderInfo } from "@/components/transactions/quick-screenshot-entry";
import type { TransactionCategoryOption } from "@/components/transactions/transaction-form";
import type { Locale } from "@/lib/i18n/locale";
import type { StatisticsOverview } from "@/services/statistics-service";
import type { TransactionView } from "@/types/transaction";

import { DesktopHeroSection } from "./desktop-hero-section";
import { DesktopRecentTransactionsCard } from "./desktop-recent-transactions-card";
import { DesktopReviewQueueCard } from "./desktop-review-queue-card";
import { DesktopStatRow } from "./desktop-stat-row";
import { DesktopStreakSavingsRow } from "./desktop-streak-savings-row";
import type { HomeModel } from "./home-model";

export function DesktopDashboard({
  categories,
  locale = "en",
  model,
  notificationCount,
  overview,
  recentTransactions,
  recognitionProvider,
  reminderBatches,
  reminderJobs,
}: {
  categories: TransactionCategoryOption[];
  locale?: Locale;
  model: HomeModel;
  notificationCount: number;
  overview: StatisticsOverview;
  recentTransactions: TransactionView[];
  recognitionProvider: QuickScreenshotProviderInfo;
  reminderBatches: ReminderItem[];
  reminderJobs: ReminderItem[];
}) {
  return (
    <div className="hidden h-dvh min-h-[760px] flex-col gap-4 overflow-hidden px-6 pb-5 pt-5 lg:flex">
      <DesktopHeroSection
        categories={categories}
        locale={locale}
        model={model}
        recentTransactions={recentTransactions}
        recognitionProvider={recognitionProvider}
      />

      <DesktopStatRow locale={locale} model={model} overview={overview} />

      <DesktopStreakSavingsRow locale={locale} model={model} />

      <section className="grid min-h-0 flex-1 grid-cols-[1.12fr_1fr] gap-4">
        <DesktopRecentTransactionsCard
          items={overview.recentTransactions}
          locale={locale}
          transactionCount={overview.summary.transactionCount}
        />

        <DesktopReviewQueueCard
          locale={locale}
          notificationCount={notificationCount}
          pendingCount={model.pendingCount}
          reminderBatches={reminderBatches}
          reminderJobs={reminderJobs}
        />
      </section>
    </div>
  );
}
