import { ArrowLeft, CalendarDays, CreditCard, Download, Pencil, Tag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { DeleteTransactionButton } from "@/components/transactions/delete-transaction-button";
import { TransactionTypeBadge } from "@/components/transactions/transaction-type-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentUserForRender } from "@/lib/auth/session";
import { localeTag, translator } from "@/lib/i18n/locale";
import { getLocaleForRender, getTForRender } from "@/lib/i18n/server";
import { formatMoney, formatSignedMoney } from "@/lib/money";
import { transactionTitle } from "@/lib/order-details";
import {
  formatTransactionDate,
  isIncoming,
  transactionSourceLabel,
} from "@/lib/transaction-display";
import { transactionService } from "@/services/transaction-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTForRender();
  return { title: t("Transaction details", "交易详情") };
}

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireCurrentUserForRender();
  const { id } = await params;
  const item = transactionService.get(user.id, id);
  if (!item) notFound();
  const locale = await getLocaleForRender();
  const t = translator(locale);
  const sourceLabel = transactionSourceLabel(item.source, locale);
  // A payment whose goods are known is titled by them, with the shop beneath.
  const title = transactionTitle(item);
  const subtitle = title === item.description ? item.merchantName : item.description;
  const orderItems = item.orderDetails?.items ?? [];

  const details = [
    { key: "time", icon: CalendarDays, label: t("Transaction time", "交易时间"), value: formatTransactionDate(item.transactionTime, true, locale) },
    { key: "category", icon: Tag, label: t("Spending category", "消费分类"), value: item.categoryName ?? t("Uncategorized", "未分类") },
    { key: "payment", icon: CreditCard, label: t("Payment method", "支付方式"), value: item.paymentMethod ?? t("Not provided", "未填写") },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/transactions"><ArrowLeft className="size-4" />{t("Back to transactions", "返回交易")}</Link>
      </Button>
      <PageHeader
        title={t("Transaction details", "交易详情")}
        action={
          <Button asChild variant="outline">
            <Link href={`/transactions/${item.id}/edit`}><Pencil className="size-4" />{t("Edit", "编辑")}</Link>
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="border-b-2 border-divider bg-tint-amber px-6 py-8 sm:px-8">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <TransactionTypeBadge type={item.type} />
              <Badge className="border-2 border-divider bg-tint-sky text-foreground">{sourceLabel}</Badge>
            </div>
            <p className={`mt-6 text-4xl font-black tracking-tight tabular-nums ${isIncoming(item.type) ? "text-income" : "text-expense"}`}>
              {formatSignedMoney(
                item.amountMinor,
                isIncoming(item.type) ? "+" : "-",
                item.currency,
              )}
            </p>
            <h2 className="mt-4 text-xl font-black text-foreground">{title ?? t("Untitled transaction", "未命名交易")}</h2>
            {subtitle && subtitle !== title ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
          </div>
        </div>
        <CardContent className="grid gap-5 p-6 sm:grid-cols-3 sm:p-8">
          {details.map((detail) => (
            <div key={detail.key}>
              <div className="flex items-center gap-2 text-xs font-semibold text-muted">
                <detail.icon className="size-3.5" />{detail.label}
              </div>
              <p className="mt-2 text-sm font-bold text-foreground">{detail.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {orderItems.length ? (
        <Card>
          <CardHeader><CardTitle>{t("Items", "商品清单")}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-3">
              {orderItems.map((orderItem, index) => (
                <li key={index} className="flex items-start justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground">{orderItem.name}</span>
                    {orderItem.spec || orderItem.quantity ? (
                      <span className="mt-0.5 block text-xs text-muted">
                        {[orderItem.spec, orderItem.quantity ? `×${orderItem.quantity}` : null].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  {orderItem.priceMinor !== null ? (
                    <span className="shrink-0 font-semibold tabular-nums text-foreground">
                      {formatMoney(orderItem.priceMinor, item.currency, localeTag(locale))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">
              {t(
                "Listed prices from the order page; they may not add up to the amount paid.",
                "标价来自下单页，合计可能与实付金额不同。",
              )}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>{t("Record details", "记录信息")}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between gap-4"><span className="text-muted">{t("Source", "来源")}</span><span className="font-semibold text-foreground">{sourceLabel}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted">{t("Currency", "币种")}</span><span className="font-semibold text-foreground">{item.currency}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted">{t("Duplicate status", "重复状态")}</span><span className="font-semibold text-foreground">{item.duplicateStatus === "unique" ? t("No duplicates found", "未发现重复") : item.duplicateStatus === "duplicate" ? t("Duplicate", "重复") : t("Possible duplicate", "疑似重复")}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted">{t("Last modified", "最后修改")}</span><span className="font-semibold text-foreground">{formatTransactionDate(item.updatedAt, true, locale)}</span></div>
          {item.originalFileId ? <div className="flex items-center justify-between gap-4"><span className="text-muted">{t("Original file", "原始文件")}</span><Button asChild variant="ghost" size="sm"><a href={`/api/files/${item.originalFileId}`}><Download className="size-3.5" />{t("Download and view", "下载查看")}</a></Button></div> : null}
        </CardContent>
      </Card>

      <div className="flex justify-end border-t-2 border-divider pt-6">
        <DeleteTransactionButton
          id={item.id}
          expectedRevisionId={item.currentRevisionId}
        />
      </div>
    </div>
  );
}
