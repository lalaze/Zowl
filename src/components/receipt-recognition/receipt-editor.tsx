"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  ImageOff,
  LoaderCircle,
  PencilLine,
  Save,
  SkipForward,
  XCircle,
} from "lucide-react";
import { useEffect, useReducer } from "react";

import { AiCategorySuggestionNotice } from "@/components/categories/ai-category-suggestion-notice";
import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { requestApi } from "@/lib/client-api";
import { localizeServerMessage } from "@/lib/i18n/server-messages";
import { transactionTypeLabel } from "@/lib/transaction-display";
import { cn } from "@/lib/utils";

import {
  buildReceiptUpdate,
  confidenceLabel,
  createReceiptEditorState,
  missingEditorFields,
  normalizedDecision,
  receiptEditorReducer,
  warningMessage,
  type EditorValues,
} from "./receipt-editor-model";
import {
  isDuplicateKind,
  isPossibleDuplicate,
  type ReceiptCategory,
  type ReceiptDecision,
  type ReceiptRecognitionItem,
  type ReceiptType,
} from "./types";

const receiptTypes: ReceiptType[] = ["expense", "income", "transfer", "refund"];

function ReceiptImage({ item }: { item: ReceiptRecognitionItem }) {
  const t = useT();
  if (item.fileDeleted) {
    return (
      <div className="grid aspect-[4/3] place-items-center rounded-2xl border-2 border-dashed border-divider bg-tint-berry text-center text-muted">
        <span>
          <ImageOff className="mx-auto size-7 text-subtle" />
          <span className="mt-2 block text-sm font-black text-foreground">{t("Original image deleted", "原图已删除")}</span>
          <span className="mt-1 block max-w-48 truncate text-xs">{item.fileName}</span>
        </span>
      </div>
    );
  }
  const previewUrl = item.previewUrl || `/api/files/${item.fileId}`;

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-divider bg-surface-muted">
      <a
        href={previewUrl}
        target="_blank"
        rel="noreferrer"
        className="group relative block aspect-[4/3]"
        aria-label={t(`Open ${item.fileName} Original image`, `打开 ${item.fileName} 原图`)}
      >
        {/* Authenticated image URLs must be requested by the browser with its session cookie. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={t(`${item.fileName} Original screenshot`, `${item.fileName} 原始截图`)}
          className="size-full object-contain"
        />
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-xl border-2 border-divider bg-surface/90 px-2 py-1 text-[11px] font-extrabold text-foreground backdrop-blur transition group-hover:bg-surface-muted">
          {t("Original image", "原图")} <ExternalLink className="size-3" />
        </span>
      </a>
      <p className="truncate border-t-2 border-divider bg-surface px-3 py-2 text-xs font-bold text-muted">
        {item.fileName}
      </p>
    </div>
  );
}

export function ReceiptEditor({
  jobId,
  item,
  categories,
  onUpdated,
  onDirtyChange,
}: {
  jobId: string;
  item: ReceiptRecognitionItem;
  categories: ReceiptCategory[];
  onUpdated: (itemId: string, patch: Partial<ReceiptRecognitionItem>) => void;
  onDirtyChange: (itemId: string, dirty: boolean) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const typeOptions = receiptTypes.map((value) => ({
    value,
    label: transactionTypeLabel(value, locale),
  }));
  const [state, dispatch] = useReducer(
    receiptEditorReducer,
    item,
    createReceiptEditorState,
  );
  const {
    values,
    dirty,
    pending,
    decisionPending,
    error,
    saved,
  } = state;

  useEffect(() => {
    dispatch({ type: "sync_item", item });
  }, [item]);

  useEffect(
    () => () => {
      onDirtyChange(item.id, false);
    },
    [item.id, onDirtyChange],
  );

  function change<Key extends keyof EditorValues>(key: Key, value: EditorValues[Key]) {
    if (!dirty) {
      onDirtyChange(item.id, true);
    }
    dispatch({ type: "change", key, value });
  }

  function patch(body: Record<string, unknown>, fallback: string) {
    return requestApi<ReceiptRecognitionItem>(
      `/api/imports/screenshots/${jobId}/items/${item.id}`,
      {
        method: "PATCH",
        json: body,
        fallbackError: fallback,
      },
    );
  }

  async function save() {
    const result = buildReceiptUpdate(values, locale);
    if (!result.success) {
      dispatch({ type: "request_error", message: result.error });
      return;
    }

    dispatch({ type: "request_start", request: "save" });
    try {
      const responseItem = await patch(
        result.update,
        t("Failed to save. Check your entries", "保存失败，请检查填写的内容"),
      );
      onUpdated(item.id, responseItem ?? result.update);
      dispatch({ type: "save_success" });
      onDirtyChange(item.id, false);
    } catch (caught) {
      dispatch({
        type: "request_error",
        message:
          caught instanceof Error
            ? caught.message
            : t("Network connection failed. Try again later", "网络连接失败，请稍后重试"),
      });
    } finally {
      dispatch({ type: "request_end", request: "save" });
    }
  }

  async function decide(decision: ReceiptDecision) {
    if (decisionPending) return;
    dispatch({ type: "request_start", request: "decision" });
    try {
      const responseItem = await patch(
        { decision },
        t("Selection was not saved. Try again", "选择未保存，请重试"),
      );
      onUpdated(item.id, responseItem ?? { decision });
      if (decision === "skip" && dirty) {
        dispatch({ type: "skip_success", item });
        onDirtyChange(item.id, false);
      }
    } catch (caught) {
      dispatch({
        type: "request_error",
        message:
          caught instanceof Error
            ? caught.message
            : t("Network connection failed. Try again later", "网络连接失败，请稍后重试"),
      });
    } finally {
      dispatch({ type: "request_end", request: "decision" });
    }
  }

  async function adoptAiSuggestion() {
    dispatch({ type: "request_start", request: "save" });
    try {
      const responseItem = await patch(
        { action: "adopt_ai" },
        t("AI Failed to adopt category suggestion. Try again", "AI 分类建议采用失败，请重试"),
      );
      if (responseItem) {
        onUpdated(item.id, responseItem);
        dispatch({ type: "adopt_success", item: responseItem });
      }
    } catch (caught) {
      dispatch({
        type: "request_error",
        message:
          caught instanceof Error
            ? caught.message
            : t("Network connection failed. Try again later", "网络连接失败，请稍后重试"),
      });
    } finally {
      dispatch({ type: "request_end", request: "save" });
    }
  }

  const missing = missingEditorFields(values);
  const decision = normalizedDecision(item);
  const duplicate = isDuplicateKind(item.duplicateKind);
  const possibleDuplicate = isPossibleDuplicate(item.duplicateKind);
  const filteredCategories = categories.filter(
    (category) =>
      category.kind === "both" ||
      (values.type === "income" || values.type === "refund"
        ? category.kind === "income"
        : category.kind === "expense"),
  );

  return (
    <article className="overflow-hidden rounded-[24px] border-2 border-divider bg-surface">
      <div className="border-b-2 border-divider bg-tint-berry px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {item.status.toLowerCase() === "failed" || item.errorMessage ? (
              <Badge variant="danger"><ImageOff className="mr-1 size-3" />{t("Recognition failed · Complete manually", "识别失败 · 可手动补录")}</Badge>
            ) : missing.type || missing.amount || missing.transactionTime || missing.currency ? (
              <Badge variant="warning"><PencilLine className="mr-1 size-3" />{t("Missing fields", "缺少字段")}</Badge>
            ) : (
              <Badge variant="success"><Check className="mr-1 size-3" />{t("Fields complete", "字段已齐全")}</Badge>
            )}
            {confidenceLabel(item.confidence, locale) ? <Badge>{confidenceLabel(item.confidence, locale)}</Badge> : null}
            {duplicate ? (
              <Badge variant={possibleDuplicate ? "warning" : "danger"}>
                <CircleHelp className="mr-1 size-3" />
                {possibleDuplicate ? t("Possible duplicate", "疑似重复") : t("Duplicate detected", "检测到重复")}
              </Badge>
            ) : null}
          </div>
          <Badge variant={decision === "skip" ? "default" : decision === "pending" ? "warning" : "info"}>
            {decision === "skip"
              ? t("Will skip", "将跳过")
              : decision === "pending"
                ? t("Choose action", "待选择")
                : decision === "import_anyway"
                  ? t("Import anyway", "仍然导入")
                  : t("Ready to import", "准备导入")}
          </Badge>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[17rem_1fr]">
        <div className="space-y-3">
          <ReceiptImage item={item} />
          {item.errorMessage ? (
            <p className="flex items-start gap-2 rounded-2xl border-2 border-divider bg-tint-berry p-3 text-xs font-semibold leading-5 text-danger">
              <XCircle className="mt-0.5 size-3.5 shrink-0" />
              {localizeServerMessage(item.errorMessage, locale)}
              {t(
                ". Use the original image to fill in the fields manually and continue.",
                "。你可以对照原图手动填写后继续。",
              )}
            </p>
          ) : null}
          {item.warnings?.length ? (
            <div className="space-y-1.5 rounded-2xl border-2 border-divider bg-tint-amber p-3">
              {item.warnings.map((warning, index) => (
                <p key={`${warningMessage(warning, locale)}-${index}`} className="flex items-start gap-2 text-xs font-semibold leading-5 text-foreground">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{warningMessage(warning, locale)}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label
                className={cn(missing.type && "text-danger")}
                htmlFor={`receipt-${item.id}-type`}
              >
                {t("Transaction type", "收支类型")} {missing.type ? t("· Required", "· 必填") : ""}
              </Label>
              <Select
                aria-invalid={missing.type}
                id={`receipt-${item.id}-type`}
                onValueChange={(type) => {
                  change("type", type as ReceiptType | "");
                  change("categoryId", "");
                }}
                options={[
                  ...(values.type
                    ? [
                        {
                          value: "",
                          label: t("Clear selection", "清除选择"),
                          description: t("Mark incomplete", "标记为待补充"),
                        },
                      ]
                    : []),
                  ...typeOptions,
                ]}
                placeholder={t("Choose a transaction type", "请选择收支类型")}
                value={values.type}
              />
            </div>
            <label className="space-y-1.5">
              <Label className={cn(missing.amount && "text-danger")}>{t("Amount", "金额")} {missing.amount ? t("· Required", "· 必填") : ""}</Label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center font-black text-muted">¥</span>
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  className={cn("pl-8 font-black tabular-nums", missing.amount && "border-danger bg-tint-berry")}
                  value={values.amount}
                  onChange={(event) => change("amount", event.target.value)}
                />
              </div>
            </label>
            <label className="space-y-1.5">
              <Label className={cn(missing.transactionTime && "text-danger")}>{t("Transaction time", "交易时间")} {missing.transactionTime ? t("· Required", "· 必填") : ""}</Label>
              <Input
                type="datetime-local"
                step="1"
                className={cn(missing.transactionTime && "border-danger bg-tint-berry")}
                value={values.transactionTime}
                onChange={(event) => change("transactionTime", event.target.value)}
              />
            </label>
            <label className="space-y-1.5">
              <Label>{t("Counterparty / Merchant", "交易对方 / 商户")}</Label>
              <Input value={values.merchantName} placeholder={t("Optional", "可留空")} onChange={(event) => change("merchantName", event.target.value)} />
            </label>
            <div className="space-y-1.5">
              <Label htmlFor={`receipt-${item.id}-category`}>{t("Category", "分类")}</Label>
              <Select
                id={`receipt-${item.id}-category`}
                onValueChange={(categoryId) =>
                  change("categoryId", categoryId)
                }
                options={[
                  {
                    value: "",
                    label: t("Leave uncategorized", "暂不分类"),
                    description: t("Complete manually later", "稍后再手动处理"),
                  },
                  ...filteredCategories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  })),
                ]}
                value={values.categoryId}
              />
              {item.suggestedCategory ? <p className="text-xs text-accent-text">{t("Recognition suggestion:", "识别建议：")}{item.suggestedCategory}</p> : null}
              {item.categorySuggestion ? (
                <AiCategorySuggestionNotice
                  suggestion={item.categorySuggestion}
                  pending={pending}
                  className="rounded-2xl py-2"
                  onAdopt={adoptAiSuggestion}
                />
              ) : null}
            </div>
            <label className="space-y-1.5">
              <Label className={cn(missing.currency && "text-danger")}>{t("Currency", "币种")} {missing.currency ? t("· Required", "· 必填") : ""}</Label>
              <Input className={cn(missing.currency && "border-danger bg-tint-berry")} maxLength={3} placeholder={t("For example CNY", "例如 CNY")} value={values.currency} onChange={(event) => change("currency", event.target.value.toUpperCase())} />
            </label>
            <label className="space-y-1.5">
              <Label>{t("Payment method", "支付方式")}</Label>
              <Input value={values.paymentMethod} placeholder={t("For example: Alipay balance", "例如：支付宝余额")} onChange={(event) => change("paymentMethod", event.target.value)} />
            </label>
            <label className="space-y-1.5">
              <Label>{t("Transaction status", "交易状态")}</Label>
              <Input value={values.transactionStatus} placeholder={t("For example: Transaction successful", "例如：交易成功")} onChange={(event) => change("transactionStatus", event.target.value)} />
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <Label>{t("Platform transaction ID", "平台交易号")}</Label>
              <Input value={values.platformTransactionId} placeholder={t("Optional", "可留空")} onChange={(event) => change("platformTransactionId", event.target.value)} />
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <Label>{t("Notes", "备注")}</Label>
              <Textarea value={values.description} placeholder={t("Item, purpose, or recognition notes", "商品、用途或识别备注")} onChange={(event) => change("description", event.target.value)} />
            </label>
          </div>

          {duplicate ? (
            <fieldset className="rounded-2xl border-2 border-divider bg-tint-amber p-3.5">
              <legend className="rounded-full border-2 border-divider bg-surface px-2.5 py-1 text-sm font-black text-foreground">{t("Duplicate review · Explicit choice required", "重复核对 · 需要明确选择")}</legend>
              <p className="mt-1 text-xs font-semibold leading-5 text-muted">
                {possibleDuplicate
                  ? t(
                      "The time, amount, or other fields resemble an existing transaction. Compare with the original image.",
                      "时间、金额等字段与已有交易接近，请对照原图决定。",
                    )
                  : t(
                      "An identical transaction exists. This item will be skipped to avoid posting twice.",
                      "已有一笔完全相同的交易，为避免重复入账将跳过这笔。",
                    )}
              </p>
              <div className={cn("mt-3 grid gap-2", possibleDuplicate && "grid-cols-2")}>
                <Button type="button" variant={decision === "skip" ? "default" : "outline"} size="sm" disabled={decisionPending} onClick={() => decide("skip")}>
                  <SkipForward className="size-3.5" />{t("Skip this item", "跳过这笔")}
                </Button>
                {possibleDuplicate ? (
                  <Button type="button" variant={decision === "import_anyway" ? "primary" : "outline"} size="sm" disabled={decisionPending} onClick={() => decide("import_anyway")}>
                    <CheckCircle2 className="size-3.5" />{t("Import anyway", "仍然导入")}
                  </Button>
                ) : null}
              </div>
            </fieldset>
          ) : (
            <Button
              type="button"
              variant={decision === "skip" ? "secondary" : "ghost"}
              size="sm"
              disabled={decisionPending}
              onClick={() => decide(decision === "skip" ? "import" : "skip")}
            >
              <SkipForward className="size-3.5" />{decision === "skip" ? t("Restore import", "恢复导入") : t("Do not import this screenshot", "不导入这张截图")}
            </Button>
          )}

          {error ? <p role="alert" className="rounded-2xl border-2 border-divider bg-tint-berry px-3 py-2 text-sm font-semibold text-danger">{error}</p> : null}
          <div className="flex items-center justify-end gap-3 border-t-2 border-divider pt-4">
            {saved && !dirty ? <span className="inline-flex items-center gap-1 text-xs font-bold text-income"><Check className="size-3.5" />{t("Saved", "已保存")}</span> : null}
            {dirty ? <span className="text-xs font-bold text-accent-text">{t("Unsaved changes", "有未保存的修改")}</span> : null}
            <Button type="button" size="sm" disabled={!dirty || pending || decision === "skip"} onClick={save}>
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              {pending ? t("Saving…", "保存中…") : t("Save fields", "保存字段")}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
