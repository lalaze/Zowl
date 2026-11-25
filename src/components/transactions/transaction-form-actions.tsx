"use client";

import { ArrowLeft, ArrowRight, Check, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { localeTag } from "@/lib/i18n/locale";

export function TransactionFormReview({
  assessmentDigest,
  matchedTransactionId,
  disabled,
  message,
  mode,
  onConfirm,
}: {
  assessmentDigest: string;
  matchedTransactionId?: string | null;
  disabled: boolean;
  message: string;
  mode: "create" | "edit";
  onConfirm: (assessmentDigest: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [match, setMatch] = useState<{ amount: string; currency: string; merchantName: string | null; transactionTime: string } | null>(null);
  useEffect(() => {
    let active = true;
    if (matchedTransactionId) void fetch(`/api/transactions/${matchedTransactionId}`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (active) setMatch(payload?.data ?? null); })
      .catch(() => { if (active) setMatch(null); });
    return () => { active = false; };
  }, [matchedTransactionId]);
  return (
    <div
      role="alert"
      className="space-y-3 rounded-2xl border-2 border-divider bg-tint-amber px-4 py-3 text-sm font-semibold text-foreground"
    >
      <p>{message}{t(" Review before deciding whether to post anyway.", "请先核对，再决定是否仍要入账。")}</p>
      {matchedTransactionId ? (
        <div className="space-y-1 rounded-xl border-2 border-divider bg-surface px-3 py-2">
          {match ? (
            <p className="text-foreground">
              {match.merchantName || t("Unnamed merchant", "未命名商户")} · {match.currency}{" "}
              {match.amount} ·{" "}
              {new Date(match.transactionTime).toLocaleString(localeTag(locale))}
            </p>
          ) : null}
          <Link
            className="font-extrabold text-accent-text underline-offset-4 hover:underline"
            href={`/transactions/${matchedTransactionId}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("View matching transaction", "查看相似交易")}
          </Link>
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => onConfirm(assessmentDigest)}
      >
        {mode === "create" ? t("Post anyway", "仍然入账") : t("Save anyway", "仍然保存")}
      </Button>
    </div>
  );
}

export function TransactionFormActions({
  isSubmitting,
  layout,
  mode,
  onCancel,
  onMore,
  expanded = false,
  transactionId,
}: {
  isSubmitting: boolean;
  layout: "full" | "quick";
  mode: "create" | "edit";
  onCancel?: () => void;
  onMore: () => void;
  expanded?: boolean;
  transactionId?: string;
}) {
  const t = useT();
  if (layout === "quick") {
    return (
      <div className="flex flex-col-reverse gap-3 border-t-2 border-divider pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          disabled={isSubmitting}
          onClick={onMore}
        >
          {expanded ? t("Fewer details", "收起详情") : t("Add more details", "填写更多信息")}
          <ArrowRight className="size-4" />
        </Button>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            {t("Cancel", "取消")}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {isSubmitting ? t("Posting…", "正在入账…") : t("Confirm and post", "确认入账")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button type="button" variant="ghost" asChild>
        <Link
          href={
            transactionId
              ? `/transactions/${transactionId}`
              : "/transactions"
          }
        >
          <ArrowLeft className="size-4" />
          {t("Cancel", "取消")}
        </Link>
      </Button>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Check className="size-4" />
        )}
        {isSubmitting
          ? t("Saving…", "正在保存…")
          : mode === "create"
            ? t("Save transaction", "保存交易")
            : t("Save changes", "保存修改")}
      </Button>
    </div>
  );
}
