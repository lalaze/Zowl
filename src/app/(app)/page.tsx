import { DesktopDashboard } from "@/components/home/desktop-dashboard";
import { buildHomeModel } from "@/components/home/home-model";
import { MobileHome } from "@/components/home/mobile-home";
import { requireCurrentUserForRender } from "@/lib/auth/session";
import { getLocaleForRender } from "@/lib/i18n/server";
import { importService } from "@/services/import-service";
import { notificationCaptureService } from "@/services/notification-capture-service";
import { screenshotRecognitionService } from "@/services/screenshot-recognition-service";
import {
  getCurrentMonthInTimeZone,
  statisticsService,
} from "@/services/statistics-service";
import { transactionService } from "@/services/transaction-service";

export default async function HomePage() {
  const user = await requireCurrentUserForRender();
  const locale = await getLocaleForRender();
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
  const model = buildHomeModel({
    overview,
    now,
    displayName: user.displayName,
    timeZone: user.timezone,
    locale,
    reminderJobsCount: reviewingJobs.length,
    reminderBatchesCount: reviewingBatches.length,
    notificationCount,
  });

  return (
    <>
      <DesktopDashboard
        categories={categories}
        locale={locale}
        model={model}
        notificationCount={notificationCount}
        overview={overview}
        recentTransactions={recentTransactions}
        recognitionProvider={recognitionProvider}
        reminderBatches={reviewingBatches}
        reminderJobs={reviewingJobs}
      />
      <MobileHome
        categories={categories}
        locale={locale}
        model={model}
        notificationCount={notificationCount}
        overview={overview}
        recentTransactions={recentTransactions}
        recognitionProvider={recognitionProvider}
        reminderBatches={reviewingBatches}
        reminderJobs={reviewingJobs}
      />
    </>
  );
}
