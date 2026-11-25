"use client";

import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { localizeServerMessage } from "@/lib/i18n/server-messages";
import type { AiCategorizationProviderMetadata } from "@/services/ai-categorization-service";

import { HistoricalAiGroupCard } from "./historical-ai-group-card";
import type { HistoricalCategoryOption } from "./historical-ai-review-model";
import { useHistoricalAiReview } from "./use-historical-ai-review";

export function HistoricalAiReview({
  categories,
  metadata,
}: {
  categories: HistoricalCategoryOption[];
  metadata: AiCategorizationProviderMetadata;
}) {
  const t = useT();
  const locale = useLocale();
  const review = useHistoricalAiReview();

  if (!metadata.enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("AI Historical reclassification", "AI 历史重分类")}</CardTitle>
          <CardDescription>
            {t(
              "Historical transactions will not be scanned or changed. Existing rule-based categories remain unchanged.",
              "当前不会扫描或修改历史交易，现有的规则分类保持不变。",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 rounded-2xl border-2 border-divider bg-tint-sky p-4 text-foreground">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted" />
            <div>
              <p className="text-sm font-bold text-foreground">
                {localizeServerMessage(metadata.providerLabel, locale)}
              </p>
              <p className="mt-1 text-sm leading-6">{localizeServerMessage(metadata.disclosure, locale)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>{t("Scan transactions currently categorized as Other", "扫描当前属于「其他」的交易")}</CardTitle>
              <CardDescription>
                {t(
                  "Generate grouped suggestions first. Transaction revisions are added only after final confirmation.",
                  "先生成分组建议；只有最终确认后才会追加交易版本。",
                )}
              </CardDescription>
            </div>
            <Button
              type="button"
              disabled={review.pending !== null}
              onClick={() => void review.loadPreview()}
            >
              {review.pending === "scan" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : review.groups.length ? (
                <RefreshCw className="size-4" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {review.groups.length ? t("Scan again", "重新扫描") : t("Start scan", "开始扫描")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3 rounded-2xl border-2 border-divider bg-tint-leaf p-4 text-foreground">
            <ShieldCheck className="mt-0.5 size-5 shrink-0" />
            <p className="text-sm leading-6">
              {t(
                "Only merchants and cleaned descriptions are sent. High-confidence groups are selected by default; low-confidence groups and merchant learning require explicit selection.",
                "只发送商户和清理后的描述。高置信组默认勾选，低置信组默认不勾选；「记住此商户」也需要手动勾选。",
              )}
            </p>
          </div>
          {review.pending === "scan" ? (
            <div aria-live="polite">
              <div className="mb-2 flex justify-between text-xs font-medium text-muted">
                <span>{t("Categorizing", "正在分类")}</span>
                <span>
                  {review.progress.completed}/{review.progress.total || "…"}
                  {t(" groups", " 组")}
                </span>
              </div>
              <div className="h-4 overflow-hidden rounded-full border-2 border-divider bg-surface">
                <div
                  className="h-full rounded-r-full border-r-2 border-divider bg-income transition-all"
                  style={{
                    width: review.progress.total
                      ? `${Math.min(
                          100,
                          (review.progress.completed / review.progress.total) *
                            100,
                        )}%`
                      : "12%",
                  }}
                />
              </div>
            </div>
          ) : null}
          {review.message ? (
            <p className="flex items-start gap-2 text-sm text-income" role="status">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              {review.message}
            </p>
          ) : null}
          {review.error ? (
            <p className="flex items-start gap-2 text-sm text-danger" role="alert">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {review.error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {review.groups.length ? (
        <div className="space-y-4">
          {review.groups.map((group) => (
            <HistoricalAiGroupCard
              key={group.id}
              group={group}
              selection={
                review.selections[group.id] ?? {
                  selected: false,
                  categoryId: "",
                  learnCategoryRule: false,
                }
              }
              categories={categories}
              onChange={(update) => review.updateSelection(group.id, update)}
            />
          ))}
        </div>
      ) : null}

      {review.groups.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border-2 border-divider bg-surface p-4">
          <p className="text-sm text-muted">
            {t("Selected ", "已选择 ")}
            <strong className="text-foreground">{review.selectedCount}</strong>
            {t(" groups", " 组")}
          </p>
          <Button
            type="button"
            disabled={review.pending !== null || review.selectedCount === 0}
            onClick={() => void review.applySelected()}
          >
            {review.pending === "apply" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            {t("Confirm changes to selected transactions", "确认修改所选交易")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
