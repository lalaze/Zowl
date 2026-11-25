"use client";

import { createOperationId } from "@/lib/operation-id";

import type { TransactionView } from "@/types/transaction";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { localizeServerMessage } from "@/lib/i18n/server-messages";

import {
  TransactionFormActions,
  TransactionFormReview,
} from "./transaction-form-actions";
import { TransactionFormFields } from "./transaction-form-fields";
import {
  buildTransactionRequestBody,
  createTransactionFormSchema,
  duplicateReviewMessage,
  type TransactionCategoryOption,
  type TransactionFormInitialValue,
  type TransactionFormValues,
  type TransactionMutationPayload,
  transactionFormDefaultValues,
} from "./transaction-form-model";

export type {
  TransactionCategoryOption,
  TransactionFormInitialValue,
} from "./transaction-form-model";

export function TransactionForm({
  mode,
  transactionId,
  categories,
  initialValue,
  layout = "full",
  onCancel,
  onCreated,
  onSubmittingChange,
  onDirtyChange,
  recentTransactions = [],
  stickyActions = false,
}: {
  mode: "create" | "edit";
  transactionId?: string;
  categories: TransactionCategoryOption[];
  initialValue?: TransactionFormInitialValue;
  layout?: "full" | "quick";
  onCancel?: () => void;
  onCreated?: (transactionId: string) => void;
  onSubmittingChange?: (submitting: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  recentTransactions?: TransactionView[];
  stickyActions?: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const schema = useMemo(() => createTransactionFormSchema(t), [t]);
  const [postedId, setPostedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [postAnother, setPostAnother] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingReview, setPendingReview] = useState<{
    assessmentDigest: string;
    message: string;
    matchedTransactionId?: string | null;
  } | null>(null);
  const confirmationIdRef = useRef<string | null>(null);
  const confirmationVersionRef = useRef(1);
  const overrideAttemptRef = useRef<{
    assessmentDigest: string;
    version: number;
  } | null>(null);
  const amendmentOperationRef = useRef<string | null>(null);
  const amendmentOverrideRef = useRef<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: transactionFormDefaultValues(initialValue),
  });
  const selectedType = useWatch({ control, name: "type" });
  const selectedCurrency = useWatch({ control, name: "currency" });
  const filteredCategories = categories.filter(
    (category) =>
      category.kind === "both" ||
      (selectedType === "income" || selectedType === "refund"
        ? category.kind === "income"
        : category.kind === "expense"),
  );

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);

  function manualConfirmation(assessmentDigest?: string) {
    confirmationIdRef.current ??= createOperationId();
    if (!assessmentDigest) {
      return {
        id: confirmationIdRef.current,
        version: confirmationVersionRef.current,
      };
    }
    if (overrideAttemptRef.current?.assessmentDigest !== assessmentDigest) {
      confirmationVersionRef.current += 1;
      overrideAttemptRef.current = {
        assessmentDigest,
        version: confirmationVersionRef.current,
      };
    }
    return {
      id: confirmationIdRef.current,
      version: overrideAttemptRef.current.version,
    };
  }

  function amendmentOperation(assessmentDigest?: string) {
    if (
      !amendmentOperationRef.current ||
      (assessmentDigest && amendmentOverrideRef.current !== assessmentDigest)
    ) {
      amendmentOperationRef.current = createOperationId();
      amendmentOverrideRef.current = assessmentDigest ?? null;
    }
    return amendmentOperationRef.current;
  }

  async function submit(
    values: TransactionFormValues,
    assessmentDigest?: string,
  ) {
    setServerError(null);
    setPostedId(null);
    setPendingReview(null);
    const body = buildTransactionRequestBody({
      values,
      mode,
      initialValue,
      assessmentDigest,
      ...(mode === "edit"
        ? { operationId: amendmentOperation(assessmentDigest) }
        : { confirmation: manualConfirmation(assessmentDigest) }),
    });
    const endpoint =
      mode === "create"
        ? "/api/transactions"
        : `/api/transactions/${transactionId}`;
    let response: Response;
    let payload: TransactionMutationPayload;
    try {
      response = await fetch(endpoint, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      payload = (await response.json()) as TransactionMutationPayload;
    } catch {
      setServerError(t("Network connection failed. Try again later", "网络连接失败，请稍后重试"));
      return;
    }

    if (
      response.status === 409 &&
      payload.data &&
      "status" in payload.data &&
      payload.data.status === "needs_review" &&
      "items" in payload.data
    ) {
      const review = payload.data.items[0];
      if (review?.assessmentDigest && review.assessment) {
        setPendingReview({
          assessmentDigest: review.assessmentDigest,
          message: duplicateReviewMessage(review.assessment.reasonCode, t),
          matchedTransactionId: review.assessment.matchedTransactionId,
        });
      } else {
        const issue = review?.validationIssues[0]?.message;
        setServerError(
          issue
            ? localizeServerMessage(issue, locale)
            : t("Check transaction details and try again", "请检查交易信息后重试"),
        );
      }
      return;
    }

    if (
      response.status === 409 &&
      payload.data &&
      "status" in payload.data &&
      payload.data.status === "needs_review" &&
      "assessmentDigest" in payload.data
    ) {
      setPendingReview({
        assessmentDigest: payload.data.assessmentDigest,
        message: duplicateReviewMessage(payload.data.assessment.reasonCode, t),
        matchedTransactionId: payload.data.assessment.matchedTransactionId,
      });
      return;
    }

    if (
      response.status === 409 &&
      payload.data &&
      "status" in payload.data &&
      payload.data.status === "revision_conflict"
    ) {
      setServerError(t("Transaction updated elsewhere. Refresh before editing.", "这笔交易已在别处更新，请刷新后再编辑。"));
      return;
    }

    if (!response.ok || !payload.data || !("id" in payload.data)) {
      setServerError(
        payload.error?.message ??
          (layout === "quick"
            ? t("Posting failed. Check and try again", "入账失败，请检查后重试")
            : t("Saving failed. Check and try again", "保存失败，请检查后重试")),
      );
      return;
    }

    if (mode === "create" && postAnother) {
      setPostedId(payload.data.id);
      const defaults = transactionFormDefaultValues();
      reset({ ...defaults, currency: values.currency, categoryId: values.categoryId, type: values.type });
      confirmationIdRef.current = null;
      confirmationVersionRef.current = 1;
      overrideAttemptRef.current = null;
      router.refresh();
      document.getElementById("amount")?.focus();
      return;
    }
    if (mode === "create" && onCreated) {
      onCreated(payload.data.id);
      return;
    }

    router.push(`/transactions/${payload.data.id}`);
    router.refresh();
  }

  function onInvalid() {
    setServerError(
      layout === "quick"
        ? t("Check the highlighted fields before posting", "请先检查标出的字段再入账")
        : t("Check the highlighted fields before saving", "请先检查标出的字段再保存"),
    );
  }

  return (
    <form
      className={layout === "quick" ? "space-y-5" : "space-y-6"}
      onSubmit={(event) =>
        void handleSubmit((values) => submit(values), onInvalid)(event)
      }
      noValidate
    >
      {mode === "create" && recentTransactions.some((item) => item.merchantName) ? <div className="flex gap-2 overflow-x-auto pb-1 [&>button]:shrink-0" aria-label={t("Recent merchant templates", "最近商户模板")} role="group">
        {recentTransactions.filter((item, index, all) => item.merchantName && all.findIndex((other) => other.merchantName === item.merchantName) === index).slice(0, 4).map((item) => <button key={item.id} type="button" className="rounded-full border-2 border-divider bg-tint-sky px-3 py-1.5 text-xs font-extrabold text-foreground transition hover:bg-surface-muted" onClick={() => {
          setValue("type", item.type, { shouldDirty: true });
          setValue("merchantName", item.merchantName ?? "", { shouldDirty: true });
          setValue("categoryId", item.categoryId ?? "", { shouldDirty: true });
          setValue("currency", item.currency, { shouldDirty: true });
          setValue("paymentMethod", item.paymentMethod ?? "", { shouldDirty: true });
          setExpanded(true);
        }}>{item.merchantName}</button>)}
      </div> : null}
      {postedId ? <p role="status">{t("Transaction posted. ", "交易已入账。")}<a href={`/transactions/${postedId}`} target="_blank" rel="noopener noreferrer" className="underline">{t("View details", "查看详情")}</a></p> : null}
      <TransactionFormFields
        categories={filteredCategories}
        control={control}
        errors={errors}
        layout={expanded ? "full" : layout}
        mode={mode}
        register={register}
        selectedCurrency={selectedCurrency}
        setValue={setValue}
      />

      {pendingReview ? (
        <TransactionFormReview
          key={pendingReview.assessmentDigest}
          assessmentDigest={pendingReview.assessmentDigest}
          disabled={isSubmitting}
          message={pendingReview.message}
          matchedTransactionId={pendingReview.matchedTransactionId}
          mode={mode}
          onConfirm={(assessmentDigest) =>
            void handleSubmit(
              (values) => submit(values, assessmentDigest),
              onInvalid,
            )()
          }
        />
      ) : null}

      {serverError ? (
        <div
          role="alert"
          className="rounded-2xl border-2 border-divider bg-tint-berry px-4 py-2.5 text-sm font-semibold text-danger"
        >
          {serverError}
        </div>
      ) : null}

      <div className={stickyActions ? "sticky bottom-0 z-20 space-y-3 border-t border-divider bg-surface py-3" : "space-y-4"}>
      {mode === "create" ? <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={postAnother} onChange={(event) => setPostAnother(event.target.checked)} />
        {t("Keep open to post another", "入账后继续记下一笔")}
      </label> : null}
      <TransactionFormActions
        isSubmitting={isSubmitting}
        layout={layout}
        mode={mode}
        onCancel={onCancel ?? (() => {
          if (!isDirty || window.confirm(t("Discard unfinished changes?", "放弃未完成的修改？"))) router.push("/transactions");
        })}
        expanded={expanded}
        onMore={() => setExpanded((value) => !value)}
        transactionId={transactionId}
      />
      </div>
    </form>
  );
}
