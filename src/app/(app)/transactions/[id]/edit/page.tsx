import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { Card, CardContent } from "@/components/ui/card";
import { requireCurrentUser } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { transactionService } from "@/services/transaction-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Edit transaction", "编辑交易") };
}

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const item = transactionService.get(user.id, id);
  if (!item) notFound();
  const categories = transactionService.listCategories(user.id);
  const t = await getT();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={t("Edit transaction", "编辑交易")}
        description={t(
          "When changing a category, you can let Zowl remember it for this merchant.",
          "修改分类时，可以让 Zowl 记住这个商户的选择。",
        )}
      />
      <Card>
        <CardContent className="p-5 sm:p-7">
          <TransactionForm
            mode="edit"
            transactionId={item.id}
            categories={categories}
            initialValue={item}
          />
        </CardContent>
      </Card>
    </div>
  );
}
