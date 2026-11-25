"use client";

import { FileInput, ScanLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useT } from "@/components/i18n/i18n-provider";
import { TransactionForm, type TransactionCategoryOption } from "@/components/transactions/transaction-form";
import { Card, CardContent } from "@/components/ui/card";
import type { TransactionView } from "@/types/transaction";

export function ManualTransactionEntry({ categories, recentTransactions }: {
  categories: TransactionCategoryOption[];
  recentTransactions: TransactionView[];
}) {
  const router = useRouter();
  const t = useT();
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function canLeave() {
    return !submitting && (!dirty || window.confirm(t("Discard unfinished changes?", "放弃未完成的修改？")));
  }

  return (
    <>
      <div className="flex flex-wrap gap-4 text-sm font-extrabold text-accent-text">
        {[
          { href: "/imports/screenshots", label: t("Recognize screenshots", "识别截图"), Icon: ScanLine },
          { href: "/imports", label: t("Import & history", "导入与记录"), Icon: FileInput },
        ].map(({ href, label, Icon }) => (
          <Link
            key={href}
            className="inline-flex min-h-11 items-center gap-2"
            href={href}
            aria-disabled={submitting}
            onNavigate={(event) => { if (!canLeave()) event.preventDefault(); }}
          >
            <Icon className="size-4" />{label}
          </Link>
        ))}
      </div>
      <Card>
        <CardContent className="p-5 sm:p-7">
          <TransactionForm
            mode="create"
            layout="quick"
            stickyActions
            categories={categories}
            recentTransactions={recentTransactions}
            onDirtyChange={setDirty}
            onSubmittingChange={setSubmitting}
            onCancel={() => { if (canLeave()) router.push("/transactions"); }}
          />
        </CardContent>
      </Card>
    </>
  );
}
