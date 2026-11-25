import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { ReceiptReviewClient } from "@/components/receipt-recognition/receipt-review-client";
import { Button } from "@/components/ui/button";
import { requireCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { screenshotRecognitionService } from "@/services/screenshot-recognition-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Review screenshot recognition", "核对截图识别") };
}

export default async function ScreenshotReviewPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const user = await requireCurrentUser();
  const { jobId } = await params;
  const t = await getT();
  const aiMetadata =
    screenshotRecognitionService.getAiCategorizationMetadata(user.id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/imports/screenshots"><ArrowLeft className="size-4" />{t("Choose different images", "重新选择图片")}</Link></Button>
      <PageHeader
        title={t("Check each recognition result", "逐条核对识别结果")}
        description={t(
          "Complete red fields and resolve duplicate alerts. Save all edits before confirming the final import.",
          "补全红色字段，处理重复提示。所有修改都需先保存，再确认导入。",
        )}
      />
      <ReceiptReviewClient jobId={jobId} aiEnabled={aiMetadata.enabled} />
    </div>
  );
}
