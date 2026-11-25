"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  RotateCcw,
  SkipForward,
} from "lucide-react";
import Link from "next/link";

import { Owl } from "@/components/brand/owl";
import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { RecognitionStepper } from "./recognition-stepper";

export function ReceiptResultSummary({
  jobId,
  createdCount,
  skippedCount,
  failedCount,
}: {
  jobId: string;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
}) {
  const t = useT();
  const stats = [
    { label: t("Successfully imported", "成功导入"), value: createdCount, icon: CheckCircle2, tone: "bg-tint-leaf text-income" },
    { label: t("Skipped images", "跳过的图片"), value: skippedCount, icon: SkipForward, tone: "bg-tint-berry text-foreground" },
    { label: t("Recognition failures", "识别失败"), value: failedCount, icon: AlertCircle, tone: "bg-tint-berry text-danger" },
  ];

  return (
    <div className="space-y-6">
      <Card><CardContent className="p-5 sm:p-6"><RecognitionStepper current={3} /></CardContent></Card>

      <Card className="overflow-hidden bg-tint-leaf">
        <CardContent className="flex flex-col items-center p-8 text-center">
          <Owl className="w-24" />
          <span className="mt-3 rounded-full border-2 border-divider bg-surface px-3 py-1 text-xs font-extrabold text-foreground">
            {t("All recorded!", "都记好啦！")}
          </span>
          <h2 className="mt-5 text-2xl font-black text-foreground">
            {t(
              `${createdCount} screenshot transactions added to the ledger`,
              `${createdCount} 笔截图交易已记入账本`,
            )}
          </h2>
          <p className="mt-2 text-sm font-semibold text-muted">{t(`Task ${jobId}`, `任务 ${jobId}`)}</p>
          {failedCount ? (
            <p className="mt-3 rounded-2xl border-2 border-divider bg-tint-berry px-3 py-2 text-xs font-semibold text-danger">
              {t(
                `Including ${failedCount} images that could not be recognized automatically, now resolved through your edits or skip decisions.`,
                `其中 ${failedCount} 张未能自动识别，已按你的手动补录或跳过选择处理完毕。`,
              )}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild><Link href="/transactions">{t("View transactions", "查看交易")}<ArrowRight className="size-4" /></Link></Button>
            <Button asChild variant="outline"><Link href="/imports/screenshots"><RotateCcw className="size-4" />{t("Recognize more", "继续识别")}</Link></Button>
          </div>
        </CardContent>
      </Card>

      <section className="grid grid-cols-3 gap-3" aria-label={t("Screenshot import statistics", "截图导入结果统计")}>
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex flex-col items-center gap-2 p-3 text-center sm:flex-row sm:p-4 sm:text-left">
              <span className={`grid size-10 place-items-center rounded-2xl border-2 border-divider ${stat.tone}`}><stat.icon className="size-4" /></span>
              <div><p className="text-xs font-semibold text-muted">{stat.label}</p><p className="text-xl font-black text-foreground">{stat.value}</p></div>
            </CardContent>
          </Card>
        ))}
      </section>

      {failedCount ? (
        <p className="rounded-2xl border-2 border-divider bg-tint-amber px-4 py-3 text-sm font-semibold text-foreground">
          {t(
            "Original images are retained when recognition fails. This task was completed using your confirmed fields or skip decisions.",
            "自动识别失败时原图仍会保留；本任务已按你确认的字段或跳过选择完成。",
          )}
        </p>
      ) : null}
    </div>
  );
}
