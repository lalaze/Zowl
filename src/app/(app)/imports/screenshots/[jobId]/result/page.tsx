import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ReceiptResultSummary } from "@/components/receipt-recognition/receipt-result-summary";
import { requireCurrentUserForRender } from "@/lib/auth/session";
import { getTForRender } from "@/lib/i18n/server";
import {
  screenshotRecognitionService,
  ScreenshotRecognitionServiceError,
} from "@/services/screenshot-recognition-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTForRender();
  return { title: t("Screenshot import results", "截图导入结果") };
}

export default async function ScreenshotResultPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const user = await requireCurrentUserForRender();
  const { jobId } = await params;
  let review;
  try {
    review = screenshotRecognitionService.getReview(user.id, jobId);
  } catch (error) {
    if (
      error instanceof ScreenshotRecognitionServiceError &&
      error.status === 404
    ) {
      notFound();
    }
    throw error;
  }
  if (review.job.status !== "completed") {
    redirect(`/imports/screenshots/${jobId}/review`);
  }
  const t = await getTForRender();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={t("Screenshot import complete", "截图导入完成")}
        description={t(
          "Results are recorded for every image. Failed items are never silently removed.",
          "每张图片的处理结果都有记录，失败项不会被悄悄删除。",
        )}
      />
      <ReceiptResultSummary
        jobId={jobId}
        createdCount={review.job.importedCount}
        skippedCount={review.job.skippedCount}
        failedCount={review.job.failedCount}
      />
    </div>
  );
}
