"use client";

import { Sparkles } from "lucide-react";

import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import type { Translate } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import type { StoredAiCategorySuggestion } from "@/services/ai-categorization-service";

function suggestionLabel(suggestion: StoredAiCategorySuggestion, t: Translate) {
  if (suggestion.status === "auto_applied") {
    return t(
      `AI automatically categorized as “${suggestion.categoryName}”`,
      `AI 已自动归为「${suggestion.categoryName}」`,
    );
  }
  if (suggestion.status === "adopted") {
    return t(
      `Adopted AI suggestion: “${suggestion.categoryName}”`,
      `已采用 AI 建议「${suggestion.categoryName}」`,
    );
  }
  return suggestion.categoryName
    ? t(`AI suggestion: “${suggestion.categoryName}”`, `AI 建议「${suggestion.categoryName}」`)
    : t("AI Cannot reliably determine a category", "AI 无法可靠判断分类");
}

export function AiCategorySuggestionNotice({
  suggestion,
  pending = false,
  className,
  actionClassName,
  onAdopt,
}: {
  suggestion: StoredAiCategorySuggestion;
  pending?: boolean;
  className?: string;
  actionClassName?: string;
  onAdopt?: () => void;
}) {
  const t = useT();
  const canAdopt =
    suggestion.status === "needs_review" &&
    Boolean(suggestion.categoryId) &&
    onAdopt;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border-2 border-divider bg-tint-sky px-3 py-2.5 text-xs text-foreground",
        className,
      )}
    >
      <p className="flex items-start gap-2 leading-5">
        <Sparkles className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {suggestionLabel(suggestion, t)}
          {` · ${Math.round(suggestion.confidence * 100)}% · ${suggestion.reason}`}
        </span>
      </p>
      {canAdopt ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("self-start", actionClassName)}
          disabled={pending}
          onClick={onAdopt}
        >
          {t("Use suggestion", "采用建议")}
        </Button>
      ) : null}
    </div>
  );
}
