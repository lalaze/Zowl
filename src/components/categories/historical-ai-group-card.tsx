import { Sparkles } from "lucide-react";

import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  formatTransactionDate,
  transactionTypeLabel,
} from "@/lib/transaction-display";

import {
  compatibleHistoricalCategory,
  historicalAmountLabel,
  type HistoricalCategoryOption,
  type HistoricalGroup,
  type HistoricalSelection,
} from "./historical-ai-review-model";

export function HistoricalAiGroupCard({
  group,
  selection,
  categories,
  onChange,
}: {
  group: HistoricalGroup;
  selection: HistoricalSelection;
  categories: HistoricalCategoryOption[];
  onChange: (update: Partial<HistoricalSelection>) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const options = categories.filter((category) =>
    compatibleHistoricalCategory(category, group.type),
  );
  const suggestion = group.suggestion;

  return (
    <Card className={selection.selected ? "bg-tint-leaf" : undefined}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            aria-label={t(
              `Select ${group.merchantName ?? group.description ?? "This group"}`,
              `选择 ${group.merchantName ?? group.description ?? "该分组"}`,
            )}
            checked={selection.selected}
            className="mt-1 size-4 rounded border-divider accent-primary"
            onChange={(event) => onChange({ selected: event.target.checked })}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="truncate">
                {group.merchantName ?? group.description ?? t("Unknown merchant", "未知商户")}
              </CardTitle>
              <Badge className="border-2 border-divider bg-tint-sky text-foreground">
                {transactionTypeLabel(group.type, locale)}
              </Badge>
              <Badge className="border-2 border-divider bg-tint-amber text-foreground">
                {t(`${group.transactionCount} transactions`, `${group.transactionCount} 笔`)}
              </Badge>
            </div>
            <CardDescription className="line-clamp-2">
              {group.description || t("No additional description", "无补充描述")}
              {t(" · Most recent", " · 最近一笔 ")}
              {formatTransactionDate(group.latestTransactionTime, true, locale)}
            </CardDescription>
          </div>
          <p className="shrink-0 text-sm font-bold tabular-nums text-foreground">
            {historicalAmountLabel(group.amounts)}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {suggestion ? (
          <div
            className={`rounded-2xl border-2 border-divider p-4 text-foreground ${
              suggestion.status === "auto_applied"
                ? "bg-tint-leaf"
                : "bg-tint-amber"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="size-4" />
              <p className="text-sm font-bold">
                {t("AI suggestion:", "AI 建议：")}
                {suggestion.categoryName ?? t("Uncertain", "暂不确定")}
              </p>
              <Badge
                className="border-2 border-divider bg-surface text-foreground"
              >
                {t("Confidence", "置信度")} {Math.round(suggestion.confidence * 100)}%
              </Badge>
            </div>
            <p className="mt-1 text-sm leading-6 opacity-80">
              {suggestion.reason}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-surface-muted p-4 text-sm text-muted">
            {t(
              "AI No valid suggestion. Choose a target category manually.",
              "AI 未给出有效建议，请手动选择目标分类。",
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <Label htmlFor={`target-category-${group.id}`}>{t("Target category", "目标分类")}</Label>
            <Select
              className="mt-1"
              id={`target-category-${group.id}`}
              onValueChange={(categoryId) =>
                onChange({ categoryId, selected: Boolean(categoryId) })
              }
              options={[
                ...(selection.categoryId
                  ? [
                      {
                        value: "",
                        label: t("Clear selection", "清除选择"),
                        description: t("Keep current Other category", "保留当前的「其他」分类"),
                      },
                    ]
                  : []),
                ...options.map((category) => ({
                  value: category.id,
                  label: category.name,
                })),
              ]}
              placeholder={t("Choose a category", "请选择分类")}
              value={selection.categoryId}
            />
          </div>
          <label className="flex h-11 items-center gap-2 rounded-2xl border-2 border-divider bg-surface px-3 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={selection.learnCategoryRule}
              disabled={!group.merchantName}
              className="size-4 rounded border-divider accent-primary"
              onChange={(event) =>
                onChange({ learnCategoryRule: event.target.checked })
              }
            />
            {t("Remember this merchant", "记住此商户")}
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
