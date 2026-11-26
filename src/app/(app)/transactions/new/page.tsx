import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ManualTransactionEntry } from "@/components/transactions/manual-transaction-entry";
import { requireCurrentUserForRender } from "@/lib/auth/session";
import { getTForRender } from "@/lib/i18n/server";
import { transactionService } from "@/services/transaction-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTForRender();
  return { title: t("Manual entry", "手动记账") };
}

export default async function NewTransactionPage() {
  const user = await requireCurrentUserForRender();
  const t = await getTForRender();
  const categories = transactionService.listCategories(user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={t("Add transaction", "记一笔")}
        description={t(
          "Start with the amount. Add more details whenever you need them.",
          "先填金额，其他信息需要时再补。",
        )}
      />
      <ManualTransactionEntry categories={categories} recentTransactions={transactionService.list(user.id, 20)} />
    </div>
  );
}
