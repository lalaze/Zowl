"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import type { Translate } from "@/lib/i18n/locale";

type ClassificationProgress = {
  enabled: boolean;
  failed: boolean;
  errorCode: string | null;
  processed: number;
  autoApplied: number;
  needsReview: number;
  remaining: number;
};

export function AiClassificationRunner({
  endpoint,
  enabled,
  onCompleted,
}: {
  endpoint: string;
  enabled: boolean;
  onCompleted?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const t = useT();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) return null;

  async function run() {
    if (running) return;
    setRunning(true);
    setError(null);
    setMessage(t("Preparing unmatched transactions…", "正在准备未匹配的交易…"));
    let totalProcessed = 0;
    let totalAutoApplied = 0;
    let totalNeedsReview = 0;
    try {
      while (true) {
        const response = await fetch(endpoint, { method: "POST" });
        const payload = (await response.json()) as {
          data?: ClassificationProgress;
          error?: { message?: string };
        };
        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? t("AI Categorization failed. Try again later", "AI 分类失败，请稍后重试"));
        }
        const progress = payload.data;
        if (!progress.enabled) {
          throw new Error(t("AI categorization is not configured", "AI 分类尚未配置"));
        }
        if (progress.failed) {
          throw new Error(t("AI categorization is temporarily unavailable. Existing categories are unchanged", "AI 分类服务暂时不可用，原有分类不受影响"));
        }
        totalProcessed += progress.processed;
        totalAutoApplied += progress.autoApplied;
        totalNeedsReview += progress.needsReview;
        setMessage(
          t(
            `Processed ${totalProcessed} items; automatically adopted: ${totalAutoApplied} items; awaiting confirmation: ${totalNeedsReview} transactions`,
            `已处理 ${totalProcessed} 笔，自动采用 ${totalAutoApplied} 笔，待确认 ${totalNeedsReview} 笔`,
          ),
        );
        if (progress.remaining === 0 || progress.processed === 0) break;
      }
      if (onCompleted) await onCompleted();
      else router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("AI Categorization failed. Try again later", "AI 分类失败，请稍后重试"));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-divider bg-tint-sky px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Sparkles className="size-4" /> {t("AI Improve categories", "AI 完善分类")}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted">
          {error ??
            message ??
            t(
              "Only unmatched items are processed. High-confidence results are adopted automatically; ambiguous items require your confirmation.",
              "只处理规则未命中的交易；高置信结果自动采用，有歧义的交给你确认。",
            )}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={running} onClick={run}>
        {running ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {running ? t("Categorizing…", "分类中…") : totalLabel(message, t)}
      </Button>
    </div>
  );
}

function totalLabel(message: string | null, t: Translate) {
  return message ? t("Recheck", "重新检查") : t("Start AI Category", "开始 AI 分类");
}
