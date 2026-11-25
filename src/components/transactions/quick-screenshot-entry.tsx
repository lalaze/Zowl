"use client";

import { createOperationId } from "@/lib/operation-id";

import {
  ClipboardPaste,
  ImagePlus,
  LoaderCircle,
  ShieldAlert,
  UploadCloud,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  getApiError,
  readApiPayload,
  unwrapApiData,
} from "@/lib/client-api";
import type { Translate } from "@/lib/i18n/locale";
import { localizeServerMessage } from "@/lib/i18n/server-messages";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export type QuickScreenshotProviderInfo = {
  id: string;
  label: string;
  sendsImagesToThirdParty: boolean;
  disclosure: string;
  retentionPolicy: string;
};

export type QuickScreenshotCompletedResult = {
  status: "completed";
  jobId: string;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  transactionIds: string[];
};

type QuickScreenshotNeedsReviewResult = {
  status: "needs_review";
  jobId: string;
  reason:
    | "multiple_images"
    | "recognition_failed"
    | "missing_fields"
    | "duplicate_review"
    | "decision_required"
    | "low_confidence"
    | "recognition_warning";
};

const reviewReasonLabels: Record<
  QuickScreenshotNeedsReviewResult["reason"],
  { en: string; zh: string }
> = {
  multiple_images: { en: "Quick mode processes one screenshot at a time", zh: "快捷模式一次只处理一张截图" },
  recognition_failed: { en: "AI Could not reliably recognize this screenshot", zh: "AI 未能可靠识别这张截图" },
  missing_fields: { en: "Recognition is missing required fields such as amount or time", zh: "识别结果缺少金额、时间等必要字段" },
  duplicate_review: { en: "This transaction may already exist", zh: "这笔交易可能已经存在" },
  decision_required: { en: "Choose how to handle the recognition result", zh: "识别结果需要你选择处理方式" },
  low_confidence: { en: "AI Low confidence in recognition results 90%", zh: "AI 对识别结果的把握不足 90%" },
  recognition_warning: { en: "The recognition service returned warnings to review", zh: "识别服务返回了需要核对的提示" },
};

function validateFile(file: File, t: Translate) {
  if (!ALLOWED_TYPES.has(file.type)) {
    return t("only supports PNG, JPEG or WebP screenshots", "只支持 PNG、JPEG 或 WebP 截图");
  }
  if (!file.size || file.size > MAX_FILE_BYTES) {
    return t("Each screenshot must be smaller than 8 MiB", "单张截图必须小于 8 MiB");
  }
  return null;
}

export function QuickScreenshotEntry({
  provider,
  active = true,
  onCompleted,
  onPendingChange,
}: {
  provider: QuickScreenshotProviderInfo;
  active?: boolean;
  onCompleted: (result: QuickScreenshotCompletedResult) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const providerLabel = localizeServerMessage(provider.label, locale);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const submissionRef = useRef<{ file: File; id: string } | null>(null);
  const selectedFileRef = useRef<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [consented, setConsented] = useState(
    !provider.sendsImagesToThirdParty,
  );
  const [preview, setPreview] = useState<{
    name: string;
    url: string;
  } | null>(null);
  const [needsReview, setNeedsReview] =
    useState<QuickScreenshotNeedsReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  const submitFile = useCallback(
    async (file: File) => {
      if (pending) return;
      setError(null);
      setNeedsReview(null);
      const validationError = validateFile(file, t);
      if (validationError) {
        setError(validationError);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      if (provider.sendsImagesToThirdParty && !consented) {
        setError(t("Agree to send the screenshot to the current recognition service first", "请先同意将截图发送给当前识别服务"));
        if (inputRef.current) inputRef.current.value = "";
        return;
      }

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const previewUrl = URL.createObjectURL(file);
      previewUrlRef.current = previewUrl;
      selectedFileRef.current = file;
      setPreview({ name: file.name || t("Clipboard screenshot", "剪贴板截图"), url: previewUrl });
      setPending(true);
      onPendingChange?.(true);

      const formData = new FormData();
      formData.set("images", file);
      formData.set("autoConfirm", "true");
      if (submissionRef.current?.file !== file) submissionRef.current = { file, id: createOperationId() };
      formData.set("submissionId", submissionRef.current.id);
      if (provider.sendsImagesToThirdParty) {
        formData.set("consentToThirdParty", "true");
      }

      try {
        const response = await fetch("/api/imports/screenshots", {
          method: "POST",
          body: formData,
        });
        const payload = await readApiPayload(response);
        const result = unwrapApiData<
          QuickScreenshotCompletedResult | QuickScreenshotNeedsReviewResult
        >(payload);
        if (!response.ok || !result) {
          setError(getApiError(payload, t("Screenshot recognition or automatic posting failed. Try again", "截图识别或自动入账失败，请重试")));
          return;
        }
        if (result.status === "needs_review") {
          setNeedsReview(result);
          return;
        }
        onCompleted(result);
      } catch {
        setError(
          t(
            "Result unknown: the screenshot may already have been posted. Retry this submission or check task history",
            "结果未知：截图可能已经入账。请重试本次提交，或查看任务记录",
          ),
        );
      } finally {
        setPending(false);
        onPendingChange?.(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    }, [consented, onCompleted, onPendingChange, pending, provider, t],
  );

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      if (pending || !active) return;
      const image = Array.from(event.clipboardData?.files ?? []).find((file) =>
        ALLOWED_TYPES.has(file.type),
      );
      if (!image) return;
      event.preventDefault();
      void submitFile(image);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [active, pending, submitFile]);

  const providerUnavailable = provider.id === "unavailable";
  const mockProvider = provider.id === "mock";

  function clearPreview() {
    setNeedsReview(null);
    setError(null);
    setPreview(null);
    selectedFileRef.current = null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label={t("Select a quick-entry screenshot", "选择快捷记账截图")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void submitFile(file);
        }}
      />

      <div
        className={cn(
          "relative overflow-hidden rounded-[20px] border-2 border-dashed transition",
          dragging
            ? "border-primary bg-tint-amber"
            : "border-divider bg-surface-muted hover:bg-surface-muted",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = Array.from(event.dataTransfer.files).find((candidate) =>
            ALLOWED_TYPES.has(candidate.type),
          );
          if (file) void submitFile(file);
          else setError(t("Add PNG, JPEG or WebP screenshots", "请放入 PNG、JPEG 或 WebP 截图"));
        }}
      >
        {preview ? (
          <div className="grid gap-4 p-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border-2 border-divider bg-surface">
              <Image
                src={preview.url}
                alt={t(`Screenshot to recognize:${preview.name}`, `待识别截图：${preview.name}`)}
                fill
                unoptimized
                className="object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">
                {preview.name}
              </p>
              {pending ? (
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-accent-text">
                  <LoaderCircle className="size-4 animate-spin" />
                  {t("AI Recognizing and attempting automatic posting…", "AI 正在识别并尝试自动入账…")}
                </p>
              ) : needsReview ? (
                <p className="mt-2 text-sm font-semibold text-accent-text">
                  {t(reviewReasonLabels[needsReview.reason].en, reviewReasonLabels[needsReview.reason].zh)}
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  {t("Processing incomplete. Retry directly", "未能完成处理，可以直接重试")}
                </p>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="grid min-h-56 w-full place-items-center p-5 text-center disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            <span>
              <span className="mx-auto grid size-12 place-items-center rounded-2xl border-2 border-divider bg-tint-amber text-foreground">
                <UploadCloud className="size-6" />
              </span>
              <span className="mt-4 block font-black text-foreground">
                {t("Click, drag, or paste a payment screenshot", "点击、拖入或粘贴支付截图")}
              </span>
              <span className="mt-1 block text-sm leading-6 text-muted">
                {t("Recognized immediately; reliable results are posted automatically", "放入后立即识别；可靠结果自动入账")}
              </span>
              <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-text">
                <ClipboardPaste className="size-3.5" />{t("Paste images directly from your clipboard", "支持直接粘贴剪贴板图片")}
              </span>
            </span>
          </button>
        )}
      </div>

      <div
        className={cn(
          "rounded-2xl border-2 border-divider px-3.5 py-3 text-xs leading-5",
          provider.sendsImagesToThirdParty || providerUnavailable
            ? "bg-tint-amber text-foreground"
            : "bg-tint-leaf text-foreground",
        )}
      >
        <p className="flex items-start gap-2 font-semibold">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {providerUnavailable
              ? t("AI Recognition is unavailable. The screenshot will go to manual review.", "AI 识别当前不可用，截图会转入人工核对。")
              : mockProvider
                ? t("Mock mode leaves fields blank. The screenshot will go to manual review.", "Mock 模式不会自动填写字段，截图会转入人工核对。")
                : t(
                    `${providerLabel} processes screenshots. Only high-confidence results without warnings or possible duplicates are posted automatically.`,
                    `${providerLabel} 会处理截图；仅高置信、无警告且非疑似重复的结果会自动入账。`,
                  )}
          </span>
        </p>
        {provider.sendsImagesToThirdParty ? (
          <p className="mt-2 opacity-80">
            {localizeServerMessage(provider.disclosure, locale)}
            {t(" Retention policy:", " 留存说明：")}
            {localizeServerMessage(provider.retentionPolicy, locale)}
          </p>
        ) : null}
        {provider.sendsImagesToThirdParty ? (
          <label className="mt-3 flex cursor-pointer items-start gap-2 border-t-2 border-divider pt-3 font-semibold">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
            />
            {t(
              `I agree to send this screenshot to ${providerLabel} Recognize`,
              `我同意将这张截图发送给 ${providerLabel} 识别`,
            )}
          </label>
        ) : null}
      </div>

      {error ? <Link href="/imports/screenshots" className="underline">{t("Check task history", "查看任务记录")}</Link> : null}
      {needsReview ? (
        <div className="rounded-2xl border-2 border-divider bg-tint-amber px-4 py-3 text-sm text-foreground">
          <p className="font-black">{t("Confirm this screenshot before posting", "这张截图需要你确认后才能入账")}</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            {t(
              "The recognition result and original image are retained. Complete missing fields or resolve duplicates to continue.",
              "识别结果和原图都已保留，可以继续补全或处理重复提示。",
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild type="button" size="sm">
              <Link href={`/imports/screenshots/${needsReview.jobId}/review`}>
                {t("Review", "去核对")}
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearPreview}
            >
              <ImagePlus className="size-4" />{t("Choose another", "换一张")}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border-2 border-divider bg-tint-berry px-4 py-2.5 text-sm font-semibold text-danger"
        >
          <p>{error}</p>
          {preview ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedFileRef.current) {
                    void submitFile(selectedFileRef.current);
                  }
                }}
              >
                {t("Retry", "重试")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearPreview}
              >
                {t("Choose another", "换一张")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="text-center text-xs text-subtle">
        {t("One PNG, JPEG, or WebP image at a time, up to 8 MiB", "一次处理 1 张，支持 PNG / JPEG / WebP，单张不超过 8 MiB")}
      </p>
    </div>
  );
}
