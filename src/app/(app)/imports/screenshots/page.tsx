import { ArrowLeft, Camera, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { ScreenshotUploadForm } from "@/components/receipt-recognition/screenshot-upload-form";
import { RecognitionStepper } from "@/components/receipt-recognition/recognition-stepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentUserForRender } from "@/lib/auth/session";
import { translator } from "@/lib/i18n/locale";
import { getLocaleForRender, getTForRender } from "@/lib/i18n/server";
import { localizeServerMessage } from "@/lib/i18n/server-messages";
import { screenshotRecognitionService } from "@/services/screenshot-recognition-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTForRender();
  return { title: t("Screenshot recognition", "截图识别") };
}

const limits = [
  { en: "Maximum per upload: 10 images / 40 MiB", zh: "每次最多 10 张 / 40 MiB" },
  { en: "Maximum per image: 8 MiB", zh: "单张不超过 8 MiB" },
  { en: "Only supports PNG / JPEG / WebP", zh: "仅支持 PNG / JPEG / WebP" },
] as const;

export default async function ScreenshotImportPage() {
  await requireCurrentUserForRender();
  const locale = await getLocaleForRender();
  const t = translator(locale);
  const provider = screenshotRecognitionService.providerInfo();
  const providerMode = provider.sendsImagesToThirdParty
    ? "third-party"
    : provider.id === "unavailable"
      ? "unavailable"
      : "mock";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/imports"><ArrowLeft className="size-4" />{t("Back to import", "返回导入")}</Link></Button>
      <PageHeader
        title={t("Recognize payment screenshots", "识别支付截图")}
        description={t(
          "Select multiple images. Results stay in review until you confirm posting.",
          "可以一次选择多张图片；识别结果会先留在核对区，确认后才入账。",
        )}
      />
      <Card><CardContent className="p-5 sm:p-6"><RecognitionStepper current={1} /></CardContent></Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl border-2 border-divider bg-tint-sky text-foreground"><Camera className="size-4" /></span>{t("Choose payment screenshots", "选择支付截图")}</CardTitle></CardHeader>
        <CardContent>
          <ScreenshotUploadForm
            providerMode={providerMode}
            providerLabel={localizeServerMessage(provider.label, locale)}
            disclosure={localizeServerMessage(provider.disclosure, locale)}
            retentionPolicy={localizeServerMessage(provider.retentionPolicy, locale)}
          />
        </CardContent>
      </Card>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        {limits.map((item) => <div key={item.en} className="flex items-center gap-2 rounded-2xl border-2 border-divider bg-surface px-3 py-2.5 text-xs font-bold text-muted"><ShieldCheck className="size-4 shrink-0 text-income" />{t(item.en, item.zh)}</div>)}
      </div>
    </div>
  );
}
