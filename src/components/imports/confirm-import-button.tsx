"use client";

import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";

export function ConfirmImportButton({
  batchId,
  importCount,
  unresolvedCount,
}: {
  batchId: string;
  importCount: number;
  unresolvedCount: number;
}) {
  const router = useRouter();
  const t = useT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/imports/files/${batchId}/confirm`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      if (!response.ok) {
        setError(payload.error?.message ?? t("Import confirmation failed. Try again later", "确认导入失败，请稍后重试"));
        if (payload.error?.code === "UNRESOLVED_DUPLICATES") {
          router.replace(
            `/imports/files/${batchId}/review?reviewDuplicates=1`,
          );
          router.refresh();
        } else if (payload.error?.code === "UNRESOLVED_INVALID_ITEMS") {
          router.replace(
            `/imports/files/${batchId}/review?reviewErrors=1`,
          );
          router.refresh();
        }
        return;
      }
      router.push(`/imports/files/${batchId}/result`);
      router.refresh();
    } catch {
      setError(t("Network connection failed. Try again later", "网络连接失败，请稍后重试"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <Button
        type="button"
        variant="default"
        size="lg"
        disabled={pending || unresolvedCount > 0}
        onClick={confirm}
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        {pending
          ? t("Posting to ledger…", "正在入账…")
          : t(`Confirm import ${importCount} transactions`, `确认导入 ${importCount} 笔`)}
      </Button>
      {unresolvedCount > 0 ? <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t(`Remaining: ${unresolvedCount} records must be corrected or explicitly skipped first`, `还有 ${unresolvedCount} 笔记录需要先修正或明确跳过`)}</p> : null}
      {error ? <p className="text-xs font-semibold text-danger">{error}</p> : null}
    </div>
  );
}
