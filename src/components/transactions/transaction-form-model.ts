import { z } from "zod";

import { toDatetimeLocal } from "@/lib/date-time";
import { translator, type Translate } from "@/lib/i18n/locale";
import { decimalToMinor } from "@/lib/money";

/** Chinese for the InvalidMoneyError messages `decimalToMinor` throws. */
function moneyErrorMessage(message: string, t: Translate) {
  switch (message) {
    case "Invalid currency format":
      return t(message, "货币格式无效");
    case "Only currencies with two decimal places are supported":
      return t(message, "仅支持两位小数的币种");
    case "Amount exceeds the supported range":
      return t(message, "金额超出支持范围");
    case "Invalid amount format":
      return t(message, "金额格式无效");
    default:
      return message;
  }
}

export function createTransactionFormSchema(t: Translate) {
  return z
    .object({
      type: z.enum(["expense", "income", "transfer", "refund"]),
      amount: z
        .string()
        .trim()
        .min(1, t("Enter an amount", "请输入金额"))
        .max(24, t("Amount is too long", "金额过长")),
      currency: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{3}$/u, t("Enter a three-letter currency code", "请输入三位字母币种代码")),
      merchantName: z.string().max(120, t("Merchant name is too long", "商户名称过长")),
      description: z.string().max(240, t("Description is too long", "描述过长")),
      categoryId: z.string(),
      transactionTime: z.string().min(1, t("Choose a transaction time", "请选择交易时间")),
      paymentMethod: z.string().max(80, t("Payment method is too long", "支付方式过长")),
      learnCategoryRule: z.boolean().optional(),
    })
    .superRefine((value, context) => {
      try {
        decimalToMinor(value.amount, value.currency);
      } catch (error) {
        context.addIssue({
          code: "custom",
          path: ["amount"],
          message:
            error instanceof Error
              ? moneyErrorMessage(error.message, t)
              : t("Invalid amount format", "金额格式无效"),
        });
      }
    });
}

export type TransactionFormValues = z.infer<
  ReturnType<typeof createTransactionFormSchema>
>;

export type TransactionCategoryOption = {
  id: string;
  name: string;
  kind: "expense" | "income" | "both";
  color: string | null;
};

type ManualPostingReview = {
  status: "needs_review";
  confirmationId: string;
  items: Array<{
    assessmentDigest: string | null;
    assessment: { reasonCode: string | null; matchedTransactionId?: string | null } | null;
    validationIssues: Array<{ message: string }>;
  }>;
};

type AmendmentReview = {
  status: "needs_review";
  assessmentDigest: string;
  assessment: { reasonCode: string | null; matchedTransactionId?: string | null };
};

type RevisionConflict = {
  status: "revision_conflict";
  currentRevisionId: string | null;
};

export type TransactionMutationPayload = {
  data?:
    | { id: string }
    | ManualPostingReview
    | AmendmentReview
    | RevisionConflict;
  error?: { message?: string };
};

export type TransactionFormInitialValue = {
  type: TransactionFormValues["type"];
  amount: string;
  currency: string;
  merchantName: string | null;
  description: string | null;
  categoryId: string | null;
  transactionTime: string;
  paymentMethod: string | null;
  currentRevisionId: string | null;
};

export function duplicateReviewMessage(
  reasonCode: string | null,
  t: Translate = translator("en"),
) {
  if (reasonCode === "bank_payment_near_time") {
    return t(
      "A bank debit and payment-app transaction may describe the same payment.",
      "一笔银行扣款和一笔支付应用交易可能是同一笔付款。",
    );
  }
  if (reasonCode === "cross_source_platform_transaction_id") {
    return t(
      "A record from another source has the same platform transaction ID.",
      "另一来源的记录有相同的平台交易号。",
    );
  }
  return t(
    "An existing transaction has a very similar amount, merchant, and time.",
    "已有一笔交易的金额、商户和时间都非常接近。",
  );
}

export function transactionFormDefaultValues(
  initialValue?: TransactionFormInitialValue,
): TransactionFormValues {
  return initialValue
    ? {
        type: initialValue.type,
        amount: initialValue.amount,
        currency: initialValue.currency,
        merchantName: initialValue.merchantName ?? "",
        description: initialValue.description ?? "",
        categoryId: initialValue.categoryId ?? "",
        transactionTime: toDatetimeLocal(
          initialValue.transactionTime,
          "minutes",
        ),
        paymentMethod: initialValue.paymentMethod ?? "",
        learnCategoryRule: false,
      }
    : {
        type: "expense",
        amount: "",
        currency: "CNY",
        merchantName: "",
        description: "",
        categoryId: "",
        transactionTime: toDatetimeLocal(new Date().toISOString(), "minutes"),
        paymentMethod: "",
        learnCategoryRule: false,
      };
}

export function buildTransactionRequestBody({
  values,
  mode,
  initialValue,
  operationId,
  confirmation,
  assessmentDigest,
}: {
  values: TransactionFormValues;
  mode: "create" | "edit";
  initialValue?: TransactionFormInitialValue;
  operationId?: string;
  confirmation?: { id: string; version: number };
  assessmentDigest?: string;
}) {
  const base = {
    type: values.type,
    amount: values.amount,
    currency: values.currency,
    merchantName: values.merchantName || null,
    description: values.description || null,
    categoryId: values.categoryId || null,
    transactionTime: new Date(values.transactionTime).toISOString(),
    paymentMethod: values.paymentMethod || null,
  };
  const duplicateOverride = assessmentDigest
    ? { duplicateOverride: { assessmentDigest } }
    : {};

  if (mode === "edit") {
    return {
      ...base,
      learnCategoryRule: Boolean(values.learnCategoryRule),
      expectedRevisionId: initialValue?.currentRevisionId,
      operationId,
      ...duplicateOverride,
    };
  }

  return {
    ...base,
    confirmation,
    ...duplicateOverride,
  };
}
