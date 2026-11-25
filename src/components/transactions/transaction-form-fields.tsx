"use client";

import { Controller, useWatch } from "react-hook-form";
import type {
  Control,
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";

import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { transactionTypeLabel } from "@/lib/transaction-display";
import { cn } from "@/lib/utils";

import type {
  TransactionCategoryOption,
  TransactionFormValues,
} from "./transaction-form-model";

const fieldClassName =
  "border-2 border-divider hover:border-divider";

export function TransactionFormFields({
  categories,
  control,
  errors,
  layout,
  mode,
  register,
  selectedCurrency,
  setValue,
}: {
  categories: TransactionCategoryOption[];
  control: Control<TransactionFormValues>;
  errors: FieldErrors<TransactionFormValues>;
  layout: "full" | "quick";
  mode: "create" | "edit";
  register: UseFormRegister<TransactionFormValues>;
  selectedCurrency: string;
  setValue: UseFormSetValue<TransactionFormValues>;
}) {
  const t = useT();
  const locale = useLocale();
  return (
    <>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-muted">{t("Transaction type", "交易类型")}</legend>
        <div className="grid grid-cols-4 gap-2">
          {(["expense", "income", "transfer", "refund"] as const).map((value) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                value={value}
                className="peer sr-only"
                {...register("type", {
                  onChange: () =>
                    setValue("categoryId", "", {
                      shouldDirty: true,
                      shouldValidate: true,
                    }),
                })}
              />
              <span className="flex h-11 items-center justify-center rounded-2xl border-2 border-divider bg-surface text-sm font-bold text-muted transition peer-checked:border-divider peer-checked:bg-tint-amber peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
                {transactionTypeLabel(value, locale)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div
        className={cn(
          layout === "full" &&
            "grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]",
        )}
      >
        <div className="space-y-2">
          <Label htmlFor="amount">{t("Amount", "金额")}</Label>
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-xs font-bold text-subtle">
              {selectedCurrency || "---"}
            </span>
            <Input
              id="amount"
              inputMode="decimal"
              placeholder="0.00"
              className={cn(
                "h-14 pl-14 text-2xl font-black tabular-nums md:text-2xl",
                fieldClassName,
              )}
              aria-invalid={Boolean(errors.amount)}
              autoFocus={layout === "quick"}
              {...register("amount")}
            />
          </div>
          {errors.amount ? (
            <p className="text-sm font-semibold text-danger">
              {errors.amount.message}
            </p>
          ) : null}
        </div>
        {layout === "full" ? (
          <div className="space-y-2">
            <Label htmlFor="currency">{t("Currency", "币种")}</Label>
            <Input
              id="currency"
              className={cn("h-14 uppercase", fieldClassName)}
              maxLength={3}
              aria-invalid={Boolean(errors.currency)}
              {...register("currency")}
            />
            {errors.currency ? (
              <p className="text-sm font-semibold text-danger">
                {errors.currency.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <QuickCategoryChips
        categories={categories}
        control={control}
        setValue={setValue}
      />
      {layout === "quick" ? (
        <CategoryField
          categories={categories}
          control={control}
          description
        />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="merchantName">{t("Merchant name", "商户名称")}</Label>
              <Input
                id="merchantName"
                className={fieldClassName}
                placeholder={t("For example: Mountain Cafe", "例如：山间咖啡")}
                {...register("merchantName")}
              />
              {errors.merchantName ? (
                <p className="text-sm font-semibold text-danger">
                  {errors.merchantName.message}
                </p>
              ) : null}
            </div>
            <CategoryField categories={categories} control={control} />
            <div className="space-y-2">
              <Label htmlFor="transactionTime">{t("Transaction time", "交易时间")}</Label>
              <Input
                id="transactionTime"
                className={fieldClassName}
                type="datetime-local"
                {...register("transactionTime")}
              />
              {errors.transactionTime ? (
                <p className="text-sm font-semibold text-danger">
                  {errors.transactionTime.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">{t("Payment method", "支付方式")}</Label>
              <Input
                id="paymentMethod"
                className={fieldClassName}
                placeholder={t("For example: Alipay balance", "例如：支付宝余额")}
                {...register("paymentMethod")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t("Transaction description", "交易描述")}</Label>
            <Textarea
              id="description"
              className={fieldClassName}
              placeholder={t("Add an item, purpose, or note", "填写物品、用途或备注")}
              {...register("description")}
            />
          </div>
        </>
      )}

      {layout === "quick" ? (
        <div hidden>
          <input type="hidden" {...register("currency")} />
          <input type="hidden" {...register("merchantName")} />
          <input type="hidden" {...register("description")} />
          <input type="hidden" {...register("transactionTime")} />
          <input type="hidden" {...register("paymentMethod")} />
        </div>
      ) : null}

      {mode === "edit" ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-dashed border-divider bg-tint-amber p-4">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            {...register("learnCategoryRule")}
          />
          <span>
            <span className="block text-sm font-bold text-foreground">
              {t("Remember this merchant’s category", "记住此商户的分类")}
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-muted">
              {t(
                "Use this category first when the same merchant is recognized again.",
                "下次识别到同一商户时优先使用这个分类。",
              )}
            </span>
          </span>
        </label>
      ) : null}
    </>
  );
}

/** The six leading categories, one tap each; the full picker stays below. */
function QuickCategoryChips({
  categories,
  control,
  setValue,
}: {
  categories: TransactionCategoryOption[];
  control: Control<TransactionFormValues>;
  setValue: UseFormSetValue<TransactionFormValues>;
}) {
  const t = useT();
  const selected = useWatch({ control, name: "categoryId" });
  if (!categories.length) return null;

  return (
    <div aria-label={t("Quick categories", "常用分类")} className="flex flex-wrap gap-2" role="group">
      {categories.slice(0, 6).map((category) => (
        <button
          aria-pressed={selected === category.id}
          className="rounded-full border-2 border-divider bg-surface px-3 py-1.5 text-xs font-extrabold text-foreground transition hover:bg-surface-muted aria-pressed:border-primary aria-pressed:bg-tint-amber"
          key={category.id}
          onClick={() =>
            setValue("categoryId", category.id, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
          type="button"
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}

function CategoryField({
  categories,
  control,
  description = false,
}: {
  categories: TransactionCategoryOption[];
  control: Control<TransactionFormValues>;
  description?: boolean;
}) {
  const t = useT();
  return (
    <div className="space-y-2">
      <Label htmlFor="categoryId">{t("Category", "分类")}</Label>
      <Controller
        control={control}
        name="categoryId"
        render={({ field }) => (
          <Select
            id="categoryId"
            className={fieldClassName}
            onBlur={field.onBlur}
            onValueChange={field.onChange}
            options={[
              {
                value: "",
                label: t("Leave uncategorized", "暂不分类"),
                ...(description
                  ? { description: t("Add this later in transaction details", "之后可在交易详情中补充") }
                  : {}),
              },
              ...categories.map((category) => ({
                value: category.id,
                label: category.name,
                leading: (
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: category.color ?? "#94a3b8",
                    }}
                  />
                ),
              })),
            ]}
            value={field.value}
          />
        )}
      />
    </div>
  );
}
