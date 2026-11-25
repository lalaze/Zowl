"use client";

import { createOperationId } from "@/lib/operation-id";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";

export function DeleteTransactionButton({
  id,
  expectedRevisionId,
}: {
  id: string;
  expectedRevisionId: string | null;
}) {
  const router = useRouter();
  const t = useT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationIdRef = useRef<string | null>(null);

  async function voidTransaction() {
    if (!expectedRevisionId) {
      setError(
        t(
          "This transaction has no revision information and cannot be voided yet",
          "这笔交易缺少版本信息，暂时无法作废",
        ),
      );
      return;
    }
    if (!window.confirm(
        t(
          "Void this transaction? Its history will remain in the ledger.",
          "确定作废这笔交易吗？它的历史记录仍会保留在账本中。",
        ),
      )) return;

    setPending(true);
    setError(null);
    operationIdRef.current ??= createOperationId();
    const response = await fetch(`/api/transactions/${id}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedRevisionId,
        operationId: operationIdRef.current,
      }),
    });
    const payload = (await response.json()) as {
      data?: { status?: string };
      error?: { message?: string };
    };

    if (!response.ok) {
      if (response.status === 409 && payload.data?.status === "revision_conflict") {
        setError(t("Transaction updated elsewhere. Refresh before voiding", "这笔交易已在别处更新，请刷新后再作废"));
        router.refresh();
      } else {
        setError(payload.error?.message ?? t("Failed to void transaction. Try again later", "作废失败，请稍后重试"));
      }
      setPending(false);
      return;
    }

    router.replace("/transactions");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="danger" onClick={voidTransaction} disabled={pending}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        {pending ? t("Voiding…", "正在作废…") : t("Void", "作废")}
      </Button>
      {error ? <p className="text-xs font-semibold text-danger">{error}</p> : null}
    </div>
  );
}
