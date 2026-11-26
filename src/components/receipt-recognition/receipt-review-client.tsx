"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ImageOff,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Owl } from "@/components/brand/owl";
import { AiClassificationRunner } from "@/components/categories/ai-classification-runner";
import { useT } from "@/components/i18n/i18n-provider";
import { ReviewProgressCard } from "@/components/imports/review-progress-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getApiError,
  readApiPayload,
  requestApi,
  unwrapApiData,
} from "@/lib/client-api";
import { cn } from "@/lib/utils";

import { ReceiptEditor } from "./receipt-editor";
import {
  hasRequiredFields,
  normalizedDecision,
} from "./receipt-editor-model";
import { RecognitionStepper } from "./recognition-stepper";
import {
  type ReceiptCategory,
  type ReceiptConfirmResult,
  type ReceiptRecognitionItem,
  type ReceiptRecognitionReview,
} from "./types";

const PROCESSING_STATUSES = new Set([
  "created",
  "queued",
  "pending",
  "processing",
  "recognizing",
  "committing",
]);

function isProcessing(status: string) {
  return PROCESSING_STATUSES.has(status.toLowerCase());
}

function LoadingReview() {
  const t = useT();
  return (
    <div className="space-y-4" aria-busy="true" aria-label={t("Loading recognition results", "正在加载识别结果")}>
      {[0, 1].map((index) => <div key={index} className="h-80 animate-pulse rounded-[24px] border-2 border-divider bg-surface" />)}
    </div>
  );
}

export function ReceiptReviewClient({
  jobId,
  aiEnabled,
}: {
  jobId: string;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const [review, setReview] = useState<ReceiptRecognitionReview | null>(null);
  const [categories, setCategories] = useState<ReceiptCategory[]>([]);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [reviewResponse, categoriesResponse] = await Promise.all([
        fetch(`/api/imports/screenshots/${jobId}`, { cache: "no-store" }),
        fetch("/api/categories", { cache: "no-store" }),
      ]);
      const [reviewPayload, categoriesPayload] = await Promise.all([
        readApiPayload(reviewResponse),
        readApiPayload(categoriesResponse),
      ]);
      const nextReview = unwrapApiData<ReceiptRecognitionReview>(reviewPayload);
      if (!reviewResponse.ok || !nextReview?.job || !Array.isArray(nextReview.items)) {
        throw new Error(
          getApiError(
            reviewPayload,
            t("Failed to load recognition task. Try again", "识别任务加载失败，请重试"),
          ),
        );
      }

      setReview(nextReview);
      if (categoriesResponse.ok) {
        setCategories(unwrapApiData<ReceiptCategory[]>(categoriesPayload) ?? []);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("Network connection failed. Try again later", "网络连接失败，请稍后重试"),
      );
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [jobId, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const processing = review ? isProcessing(review.job.status) : false;
  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => void load(true), 2_000);
    return () => window.clearInterval(timer);
  }, [load, processing]);

  const updateItem = useCallback((itemId: string, patch: Partial<ReceiptRecognitionItem>) => {
    setReview((current) => current ? {
      ...current,
      items: current.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
    } : current);
  }, []);

  const updateDirty = useCallback((itemId: string, dirty: boolean) => {
    setDirtyIds((current) => {
      const next = new Set(current);
      if (dirty) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }, []);

  const summary = useMemo(() => {
    const items = review?.items ?? [];
    let importCount = 0;
    let skipCount = 0;
    let unresolvedCount = 0;

    for (const item of items) {
      const decision = normalizedDecision(item);
      if (decision === "skip") {
        skipCount += 1;
      } else if (decision === "pending" || !hasRequiredFields(item)) {
        unresolvedCount += 1;
      } else {
        importCount += 1;
      }
    }

    return { importCount, skipCount, unresolvedCount };
  }, [review]);

  async function confirm() {
    if (!review || confirming || dirtyIds.size || summary.unresolvedCount) return;
    setConfirming(true);
    setError(null);
    try {
      const result = await requestApi<ReceiptConfirmResult>(
        `/api/imports/screenshots/${jobId}/confirm`,
        {
          method: "POST",
          fallbackError: t(
            "Import confirmation failed. Try again later",
            "确认导入失败，请稍后重试",
          ),
          requireData: true,
        },
      );

      const query = new URLSearchParams({
        created: String(result.createdCount ?? 0),
        skipped: String(result.skippedCount ?? 0),
        failed: String(result.failedCount ?? 0),
      });
      router.push(`/imports/screenshots/${result.jobId || jobId}/result?${query}`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("Network connection failed. Try again later", "网络连接失败，请稍后重试"),
      );
      await load(true);
    } finally {
      setConfirming(false);
    }
  }

  if (loading && !review) return <LoadingReview />;

  if (!review) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center p-8 text-center">
          <Owl className="w-20" />
          <span className="mt-3 grid size-11 place-items-center rounded-2xl border-2 border-divider bg-tint-berry text-danger"><XCircle className="size-5" /></span>
          <h2 className="mt-4 font-black text-foreground">{t("Cannot load recognition task", "无法加载识别任务")}</h2>
          <p role="alert" className="mt-2 text-sm font-semibold text-muted">{error ?? t("Task not found or temporarily unavailable", "任务不存在或暂时不可用")}</p>
          <div className="mt-5 flex gap-2">
            <Button asChild variant="ghost"><Link href="/imports/screenshots"><ArrowLeft className="size-4" />{t("Upload again", "重新上传")}</Link></Button>
            <Button type="button" onClick={() => void load()}><RefreshCw className="size-4" />{t("Retry", "重试")}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const mockProvider = review.job.providerId.toLowerCase().includes("mock");
  const unavailableProvider = review.job.providerId === "unavailable";

  return (
    <div className="space-y-6">
      <Card><CardContent className="p-5 sm:p-6"><RecognitionStepper current={2} /></CardContent></Card>

      <div className={cn("flex items-start gap-2 rounded-2xl border-2 border-divider px-3 py-2.5 text-xs font-semibold leading-5", mockProvider ? "bg-tint-sky text-foreground" : "bg-tint-amber text-foreground")}>
        {mockProvider ? <Sparkles className="mt-0.5 size-4 shrink-0" /> : <ShieldAlert className="mt-0.5 size-4 shrink-0" />}
        <p>
          <strong>
            {mockProvider
              ? t("Mock Recognition results:", "Mock 识别结果：")
              : unavailableProvider
                ? t("Automatic recognition unavailable:", "自动识别不可用：")
                : t(`Recognition service ${review.job.providerId}: `, `识别服务 ${review.job.providerId}：`)}
          </strong>
          {mockProvider
            ? t(
                "Demo mode leaves transaction fields blank. Complete them using the original image.",
                "演示模式不会填写交易字段，请对照原图手动补全。",
              )
            : unavailableProvider
              ? t(
                  "Images were not sent to third parties. Originals are retained for manual completion.",
                  "图片没有发送给第三方，原图已保留，可直接手动补全。",
                )
              : t(
                  "Images were processed by the configured third-party service. Results are suggestions; check every field before saving.",
                  "图片已由配置的第三方服务处理，结果仅供参考，保存前请逐项核对。",
                )}
        </p>
      </div>

      {processing ? (
        <Card className="bg-tint-leaf">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-foreground">
            <LoaderCircle className="size-5 animate-spin" />
            <div><p className="font-bold">{t("Recognizing images", "正在识别图片")}</p><p className="mt-0.5 text-xs opacity-75">{t("Results refresh automatically. You can return later to continue.", "页面会自动刷新结果，你也可以稍后回来继续。")}</p></div>
          </CardContent>
        </Card>
      ) : null}

      {!processing ? (
        <AiClassificationRunner
          endpoint={`/api/imports/screenshots/${jobId}/ai-classify`}
          enabled={aiEnabled}
          onCompleted={() => load(true)}
        />
      ) : null}

      {error ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border-2 border-divider bg-tint-berry px-3 py-2.5 text-sm font-semibold text-danger">
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="size-3.5" />{t("Retry", "重试")}</Button>
        </div>
      ) : null}

      <section className="grid grid-cols-3 gap-3" aria-label={t("Review summary", "核对统计")}>
        {[
          [t("Ready to import", "准备导入"), summary.importCount, "text-income"],
          [t("Ready to skip", "准备跳过"), summary.skipCount, "text-muted"],
          [t("Pending", "待处理"), summary.unresolvedCount, "text-warn"],
        ].map(([label, value, tone]) => (
          <Card key={String(label)}><CardContent className="p-3 text-center sm:p-4"><p className="text-xs font-semibold text-muted">{label}</p><p className={cn("mt-1 text-xl font-black", String(tone))}>{value}</p></CardContent></Card>
        ))}
      </section>

      <ReviewProgressCard
        description={t(
          "Every image must be processed before you can post to the ledger",
          "每张图片都处理完后才能入账",
        )}
        processed={summary.importCount + summary.skipCount}
        total={review.items.length}
      />

      {review.items.length ? (
        <div className="space-y-4">
          {review.items.map((item) => (
            <ReceiptEditor
              key={item.id}
              jobId={jobId}
              item={item}
              categories={categories}
              onUpdated={updateItem}
              onDirtyChange={updateDirty}
            />
          ))}
        </div>
      ) : !processing ? (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center p-8 text-center"><Owl className="w-20" /><ImageOff className="mt-2 size-7 text-subtle" /><p className="mt-3 text-sm font-bold text-muted">{t("No images to review in this task", "这个任务没有需要核对的图片")}</p></CardContent></Card>
      ) : null}

      <Card className="sticky bottom-20 z-10 bg-tint-leaf lg:bottom-4">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-foreground">{t("Written to the ledger only after confirmation", "确认后才会记入账本")}</p>
            <p className="mt-1 text-xs font-semibold text-muted">
              {dirtyIds.size
                ? t(
                    `Remaining: ${dirtyIds.size} images have unsaved changes`,
                    `还有 ${dirtyIds.size} 张图片的修改未保存`,
                  )
                : summary.unresolvedCount
                  ? t(
                      `Remaining: ${summary.unresolvedCount} images have missing fields or unresolved duplicate decisions`,
                      `还有 ${summary.unresolvedCount} 张图片缺少字段或未选择重复处理方式`,
                    )
                  : t(
                      `Will import ${summary.importCount} items; skip ${summary.skipCount} transactions`,
                      `将导入 ${summary.importCount} 笔，跳过 ${summary.skipCount} 笔`,
                    )}
            </p>
          </div>
          <Button type="button" disabled={processing || confirming || !review.items.length || dirtyIds.size > 0 || summary.unresolvedCount > 0} onClick={confirm}>
            {confirming ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            {confirming
              ? t("Writing…", "正在写入…")
              : t(`Confirm import ${summary.importCount} transactions`, `确认导入 ${summary.importCount} 笔`)}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
