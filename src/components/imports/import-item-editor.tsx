"use client";

import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Translate } from "@/lib/i18n/locale";
import type {
  BillEnrichmentData,
  ImportDecision,
  ImportValidationError,
  ImportWarning,
  NormalizedImportTransaction,
} from "@/services/import-service/types";

import { patchImportItem } from "./import-review-api";

export type ReviewItem = {
  id: string;
  rowNumber: number;
  rawData: Record<string, unknown>;
  normalizedData: NormalizedImportTransaction | null;
  validationErrors: ImportValidationError[];
  warnings: ImportWarning[];
  duplicateStatus: "unique" | "possible_duplicate" | "duplicate";
  duplicateTransactionId: string | null;
  decision: ImportDecision;
  enrichmentData: BillEnrichmentData | null;
};

export type CategoryOption = {
  id: string;
  name: string;
  kind: "expense" | "income" | "both";
};

const transactionTypeOptions = (t: Translate): SelectOption[] => [
  {
    value: "expense",
    label: t("Expense", "支出"),
    description: t("Money leaving the account", "资金从账户流出"),
    leading: (
      <span className="grid size-8 place-items-center rounded-lg bg-tint-berry text-danger">
        <ArrowUpRight className="size-4" />
      </span>
    ),
  },
  {
    value: "income",
    label: t("Income", "收入"),
    description: t("Money entering the account", "资金进入账户"),
    leading: (
      <span className="grid size-8 place-items-center rounded-lg bg-tint-leaf text-income">
        <ArrowDownLeft className="size-4" />
      </span>
    ),
  },
  {
    value: "transfer",
    label: t("Transfer", "转账"),
    description: t("Money moving between accounts", "账户之间转移资金"),
    leading: (
      <span className="grid size-8 place-items-center rounded-lg bg-tint-amber text-foreground">
        <ArrowLeftRight className="size-4" />
      </span>
    ),
  },
  {
    value: "refund",
    label: t("Refund", "退款"),
    description: t("Return of a previous expense", "退回此前的支出"),
    leading: (
      <span className="grid size-8 place-items-center rounded-lg bg-tint-berry text-foreground">
        <RotateCcw className="size-4" />
      </span>
    ),
  },
];

function toDatetimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 19);
}

export function ImportItemEditor({
  batchId,
  item,
  categories,
  onClose,
}: {
  batchId: string;
  item: ReviewItem;
  categories: CategoryOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const t = useT();
  const data = item.normalizedData;
  const [values, setValues] = useState({
    type: data?.type ?? "",
    amount: data?.amount ?? "",
    currency: data?.currency ?? "CNY",
    merchantName: data?.merchantName ?? "",
    description: data?.description ?? "",
    categoryId: data?.categoryId ?? "",
    transactionTime: toDatetimeLocal(data?.transactionTime),
    paymentMethod: data?.paymentMethod ?? "",
    platformTransactionId: data?.platformTransactionId ?? "",
    status: data?.status ?? "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    if (!values.type || !values.amount || !values.transactionTime) {
      setError(
        t(
          "Complete the transaction type, amount, and time",
          "请补全收支类型、金额和交易时间",
        ),
      );
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await patchImportItem(
        batchId,
        item.id,
        {
          action: "update",
          data: {
            type: values.type,
            amount: values.amount,
            currency: values.currency,
            merchantName: values.merchantName || null,
            description: values.description || null,
            categoryId: values.categoryId || null,
            transactionTime: new Date(values.transactionTime).toISOString(),
            paymentMethod: values.paymentMethod || null,
            platformTransactionId: values.platformTransactionId || null,
            status: values.status || null,
            decision: "import",
          },
        },
        {
          fallback: t(
            "Failed to save. Check your entries",
            "保存失败，请检查填写的内容",
          ),
          network: t(
            "Network connection failed. Try again later",
            "网络连接失败，请稍后重试",
          ),
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError(
        t(
          "Network connection failed. Try again later",
          "网络连接失败，请稍后重试",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  const selectedType = values.type;
  const categoryOptions = categories.filter(
    (category) =>
      category.kind === "both" ||
      (selectedType === "income" || selectedType === "refund"
        ? category.kind === "income"
        : category.kind === "expense"),
  );
  const categorySelectOptions: SelectOption[] = [
    {
      value: "",
      label: t("Automatic suggestion", "自动建议"),
      description: t(
        "Matched automatically using merchant and description",
        "根据商户和交易说明自动匹配",
      ),
    },
    ...categoryOptions.map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ];

  return (
    <div className="mt-4 rounded-2xl border-2 border-divider bg-tint-leaf p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`import-item-${item.id}-type`}>
            {t("Transaction type", "收支类型")}
          </Label>
          <Select
            id={`import-item-${item.id}-type`}
            value={values.type}
            options={transactionTypeOptions(t)}
            onValueChange={(type) =>
              setValues((current) => ({ ...current, type, categoryId: "" }))
            }
          />
        </div>
        <label className="space-y-1.5"><Label>{t("Amount", "金额")}</Label><Input inputMode="decimal" value={values.amount} onChange={(event) => set("amount", event.target.value)} /></label>
        <label className="space-y-1.5"><Label>{t("Transaction time", "交易时间")}</Label><Input type="datetime-local" step="1" value={values.transactionTime} onChange={(event) => set("transactionTime", event.target.value)} /></label>
        <label className="space-y-1.5"><Label>{t("Merchant name", "商户名称")}</Label><Input value={values.merchantName} onChange={(event) => set("merchantName", event.target.value)} /></label>
        <div className="space-y-1.5">
          <Label htmlFor={`import-item-${item.id}-category`}>
            {t("Category", "分类")}
          </Label>
          <Select
            id={`import-item-${item.id}-category`}
            value={values.categoryId}
            options={categorySelectOptions}
            onValueChange={(categoryId) => set("categoryId", categoryId)}
          />
        </div>
        <label className="space-y-1.5"><Label>{t("Payment method", "支付方式")}</Label><Input value={values.paymentMethod} onChange={(event) => set("paymentMethod", event.target.value)} /></label>
        <label className="space-y-1.5"><Label>{t("Platform transaction ID", "平台交易号")}</Label><Input value={values.platformTransactionId} onChange={(event) => set("platformTransactionId", event.target.value)} /></label>
        <label className="space-y-1.5"><Label>{t("Transaction status", "交易状态")}</Label><Input value={values.status} onChange={(event) => set("status", event.target.value)} /></label>
        <label className="space-y-1.5 sm:col-span-2 lg:col-span-1"><Label>{t("Currency", "币种")}</Label><Input value={values.currency} maxLength={3} onChange={(event) => set("currency", event.target.value.toUpperCase())} /></label>
        <label className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label>{t("Transaction description", "交易说明")}</Label><Textarea value={values.description} onChange={(event) => set("description", event.target.value)} /></label>
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-danger">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>{t("Cancel", "取消")}</Button>
        <Button type="button" variant="default" size="sm" onClick={save} disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}{pending ? t("Saving…", "保存中…") : t("Save and recheck", "保存并重新检查")}</Button>
      </div>
    </div>
  );
}
