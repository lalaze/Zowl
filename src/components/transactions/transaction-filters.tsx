import { Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { transactionSources } from "@/db/schema";
import { translator } from "@/lib/i18n/locale";
import { getLocaleForRender } from "@/lib/i18n/server";
import {
  transactionSourceLabel,
  transactionTypeLabel,
} from "@/lib/transaction-display";
import type { TransactionListQuery } from "@/services/transaction-service/schema";

type CategoryOption = {
  id: string;
  name: string;
};

/** Filter fields sit on the white card, so they keep the filled field style. */
const fieldClassName = "";

const typeChips = ["", "expense", "income", "transfer", "refund"] as const;

export async function TransactionFilters({
  query,
  categories,
}: {
  query: TransactionListQuery;
  categories: CategoryOption[];
}) {
  const locale = await getLocaleForRender();
  const t = translator(locale);
  const activeCount = [
    query.dateFrom,
    query.dateTo,
    query.categoryId,
    query.source,
    query.type,
    query.keyword,
  ].filter(Boolean).length;

  /** 类型 chips 即时过滤：保留其余筛选条件，条件同步到地址栏 */
  function hrefWithType(type: string) {
    const params = new URLSearchParams();
    if (query.dateFrom) params.set("dateFrom", query.dateFrom);
    if (query.dateTo) params.set("dateTo", query.dateTo);
    if (query.categoryId) params.set("categoryId", query.categoryId);
    if (query.source) params.set("source", query.source);
    if (query.keyword) params.set("keyword", query.keyword);
    if (query.limit !== 20) params.set("limit", String(query.limit));
    if (type) params.set("type", type);
    const search = params.toString();
    return search ? `/transactions?${search}` : "/transactions";
  }

  return (
    <div className="space-y-3">
      <div
        aria-label={t("Filter by type", "按类型筛选")}
        className="flex flex-wrap items-center gap-2"
        role="group"
      >
        {typeChips.map((type) => {
          const active = (query.type ?? "") === type;
          return (
            <Link
              aria-current={active ? "true" : undefined}
              className={
                active
                  ? "rounded-full border-2 border-divider bg-primary px-3.5 py-1.5 text-xs font-extrabold text-on-primary"
                  : "rounded-full border-2 border-divider bg-surface px-3.5 py-1.5 text-xs font-extrabold text-muted transition hover:bg-surface-muted hover:text-foreground"
              }
              href={hrefWithType(type)}
              key={type || "all"}
            >
              {type ? transactionTypeLabel(type, locale) : t("All", "全部")}
            </Link>
          );
        })}
      </div>

    <details
      className="group rounded-[24px] border-2 border-divider bg-surface"
      open={activeCount > 0}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-bold text-foreground [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-primary" />
          {t("Search and filters", "搜索与筛选")}
          {activeCount ? (
            <span className="rounded-full border-2 border-divider bg-tint-amber px-2 py-0.5 text-xs font-extrabold text-foreground">
              {t(`${activeCount} items`, `${activeCount} 项`)}
            </span>
          ) : null}
        </span>
        <span className="text-xs font-semibold text-subtle group-open:hidden">
          {t("Expand", "展开")}
        </span>
        <span className="hidden text-xs font-semibold text-subtle group-open:inline">
          {t("Collapse", "收起")}
        </span>
      </summary>

      <form
        action="/transactions"
        className="border-t-2 border-divider p-4"
        method="get"
      >
        {query.limit !== 20 ? (
          <input name="limit" type="hidden" value={query.limit} />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1.5 text-sm font-semibold text-muted sm:col-span-2 lg:col-span-1">
            <span>{t("Merchant or description", "商户或描述")}</span>
            <Input
              className={fieldClassName}
              defaultValue={query.keyword ?? ""}
              maxLength={100}
              name="keyword"
              placeholder={t("For example: coffee, metro", "例如：咖啡、地铁")}
              type="search"
            />
          </label>
          <label className="space-y-1.5 text-sm font-semibold text-muted">
            <span>{t("Start date", "开始日期")}</span>
            <Input
              className={fieldClassName}
              defaultValue={query.dateFrom ?? ""}
              name="dateFrom"
              type="date"
            />
          </label>
          <label className="space-y-1.5 text-sm font-semibold text-muted">
            <span>{t("End date", "结束日期")}</span>
            <Input
              className={fieldClassName}
              defaultValue={query.dateTo ?? ""}
              name="dateTo"
              type="date"
            />
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="transaction-filter-category">{t("Category", "分类")}</Label>
            <Select
              className={fieldClassName}
              key={`category-${query.categoryId ?? ""}`}
              id="transaction-filter-category"
              defaultValue={query.categoryId ?? ""}
              name="categoryId"
              options={[
                { value: "", label: t("All categories", "全部分类") },
                ...categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="transaction-filter-source">{t("Source", "来源")}</Label>
            <Select
              className={fieldClassName}
              key={`source-${query.source ?? ""}`}
              id="transaction-filter-source"
              defaultValue={query.source ?? ""}
              name="source"
              options={[
                { value: "", label: t("All sources", "全部来源") },
                ...transactionSources.map((source) => ({
                  value: source,
                  label: transactionSourceLabel(source, locale),
                })),
              ]}
            />
          </div>
          {/* 类型由 chips 控制；表单提交时通过隐藏字段保留，避免高级筛选覆盖类型条件 */}
          {query.type ? (
            <input name="type" type="hidden" value={query.type} />
          ) : null}
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {activeCount ? (
            <Button asChild variant="ghost">
              <Link href="/transactions">
                <X className="size-4" />
                {t("Clear filters", "清除筛选")}
              </Link>
            </Button>
          ) : null}
          <Button type="submit">
            <Search className="size-4" />
            {t("View result", "查看结果")}
          </Button>
        </div>
      </form>
    </details>
    </div>
  );
}
