"use client";

import { LoaderCircle, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type {
  CanonicalImportField,
  FieldMapping,
} from "@/services/import-service/types";

const fields: Array<{
  key: CanonicalImportField;
  label: string;
  labelZh: string;
  required?: boolean;
}> = [
  { key: "type", label: "Transaction type", labelZh: "收支类型", required: true },
  { key: "amount", label: "Transaction amount", labelZh: "交易金额", required: true },
  { key: "transactionTime", label: "Transaction time", labelZh: "交易时间", required: true },
  { key: "merchantName", label: "Merchant name", labelZh: "商户名称" },
  { key: "description", label: "Transaction description", labelZh: "交易说明" },
  { key: "paymentMethod", label: "Payment method", labelZh: "支付方式" },
  { key: "platformTransactionId", label: "Platform transaction ID", labelZh: "平台交易号" },
  { key: "status", label: "Transaction status", labelZh: "交易状态" },
  { key: "currency", label: "Currency", labelZh: "币种" },
];

export function MappingEditor({
  batchId,
  headers,
  initialMapping,
}: {
  batchId: string;
  headers: string[];
  initialMapping: FieldMapping;
}) {
  const router = useRouter();
  const t = useT();
  const [mapping, setMapping] = useState<FieldMapping>(initialMapping);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headerOptions = [
    {
      value: "",
      label: t("Do not map", "不映射"),
      description: t("Ignore this statement field", "忽略这个账单字段"),
    },
    ...headers.map((header) => ({ value: header, label: header })),
  ];

  async function save() {
    if (
      !window.confirm(
        t(
          "Reparsing clears your row edits and duplicate decisions. Continue?",
          "重新解析会清空当前的逐行修改和重复选择。确定继续吗？",
        ),
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    const cleaned = Object.fromEntries(
      Object.entries(mapping).filter((entry) => Boolean(entry[1])),
    );
    try {
      const response = await fetch(`/api/imports/files/${batchId}/mapping`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cleaned),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setError(payload.error?.message ?? t("Failed to save field mapping", "字段映射保存失败"));
        return;
      }
      router.refresh();
    } catch {
      setError(t("Network connection failed. Try again later", "网络连接失败，请稍后重试"));
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="rounded-[24px] border-2 border-divider bg-tint-sky p-4 open:bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-black text-foreground">
        <SlidersHorizontal className="size-4" />
        {t("Generic statement field mapping", "通用账单字段映射")}
        <span className="ml-auto text-xs font-semibold text-muted">{t("Adjust here if detection fails", "无法识别时在这里调整")}</span>
      </summary>
      <div className="mt-4 grid gap-4 border-t-2 border-divider pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`mapping-${field.key}`} className="text-xs">
              {t(field.label, field.labelZh)}{field.required ? <span className="ml-1 text-danger">{t("Required", "必填")}</span> : null}
            </Label>
            <Select
              id={`mapping-${field.key}`}
              value={mapping[field.key] ?? ""}
              options={headerOptions}
              onValueChange={(header) =>
                setMapping((current) => ({
                  ...current,
                  [field.key]: header || undefined,
                }))
              }
            />
          </div>
        ))}
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-danger">{error}</p> : null}
      <div className="mt-4 flex justify-end">
        <Button type="button" size="sm" variant="outline" onClick={save} disabled={pending}>
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <SlidersHorizontal className="size-4" />}
          {pending ? t("Reparsing…", "正在重新解析…") : t("Save mapping and reparse", "保存映射并重新解析")}
        </Button>
      </div>
    </details>
  );
}
