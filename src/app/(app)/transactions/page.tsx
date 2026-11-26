import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { QuickTransactionEntry } from "@/components/transactions/quick-transaction-entry";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionList } from "@/components/transactions/transaction-list";
import { PagerNav } from "@/components/ui/pager-nav";
import { requireCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { screenshotRecognitionService } from "@/services/screenshot-recognition-service";
import { transactionService } from "@/services/transaction-service";
import {
  transactionListQuerySchema,
  type TransactionListQuery,
} from "@/services/transaction-service/schema";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Transactions", "交易") };
}

type TransactionsSearchParams = Record<
  string,
  string | string[] | undefined
>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(query: TransactionListQuery, page: number) {
  const params = new URLSearchParams();
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.source) params.set("source", query.source);
  if (query.type) params.set("type", query.type);
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.limit !== 20) params.set("limit", String(query.limit));
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/transactions?${suffix}` : "/transactions";
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<TransactionsSearchParams>;
}) {
  const user = await requireCurrentUser();
  const t = await getT();
  const rawQuery = await searchParams;
  const parsedQuery = transactionListQuerySchema.safeParse({
    dateFrom: firstValue(rawQuery.dateFrom),
    dateTo: firstValue(rawQuery.dateTo),
    categoryId: firstValue(rawQuery.categoryId),
    source: firstValue(rawQuery.source),
    type: firstValue(rawQuery.type),
    keyword: firstValue(rawQuery.keyword),
    page: firstValue(rawQuery.page),
    limit: firstValue(rawQuery.limit),
  });
  const query = parsedQuery.success
    ? parsedQuery.data
    : transactionListQuerySchema.parse({});
  const result = transactionService.listPage(user.id, query);
  const categories = transactionService.listCategories(user.id);
  const recognitionProvider = screenshotRecognitionService.providerInfo();
  const hasFilters = Boolean(
    query.dateFrom ||
      query.dateTo ||
      query.categoryId ||
      query.source ||
      query.type ||
      query.keyword,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Transactions", "交易")}
        description={t(
          "Every transaction retains its source and editable category. Bulk actions are isolated to your account.",
          "每笔交易都保留来源、分类可随时修改；批量操作只影响你自己的账号。",
        )}
        action={
          <QuickTransactionEntry
            categories={categories}
            recognitionProvider={recognitionProvider}
          />
        }
      />
      <TransactionFilters categories={categories} query={query} />
      <TransactionList
        filtered={hasFilters}
        items={result.items}
        key={result.items.map((item) => item.id).join(":")}
        totalCount={result.pagination.total}
      />
      <PagerNav
        ariaLabel={t("Transaction pagination", "交易分页")}
        page={result.pagination.page}
        totalPages={result.pagination.totalPages}
        previousHref={pageHref(query, result.pagination.page - 1)}
        nextHref={pageHref(query, result.pagination.page + 1)}
        t={t}
        showDisabledChevrons
      />
    </div>
  );
}
