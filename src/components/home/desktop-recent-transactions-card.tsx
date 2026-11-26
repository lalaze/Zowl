import { Clock3 } from "lucide-react";
import Link from "next/link";

import { CategoryGlyph } from "@/components/categories/category-glyph";
import { Card } from "@/components/ui/card";
import { translator, type Locale } from "@/lib/i18n/locale";
import { formatSignedMoney } from "@/lib/money";
import { transactionTitle } from "@/lib/order-details";
import { formatTransactionDate, isIncoming } from "@/lib/transaction-display";
import type { StatisticsOverview } from "@/services/statistics-service";

/** Tinted sticker tile in the category's own colour. */
function categoryTile(color: string | null | undefined) {
  const tint = color ?? "#8b93a1";
  return {
    backgroundColor: `color-mix(in srgb, ${tint} 14%, var(--app-surface))`,
    color: tint,
  };
}

export function DesktopRecentTransactionsCard({
  items,
  locale,
  transactionCount,
}: {
  items: StatisticsOverview["recentTransactions"];
  locale: Locale;
  transactionCount: number;
}) {
  const t = translator(locale);

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-[47px] shrink-0 items-center gap-2 px-5">
        <Clock3 className="size-4" />
        <h2 className="text-[13px] font-black text-foreground">
          {t("Recent transactions", "最近交易")}
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-5">
        {items.length ? (
          items.map((item) => (
            <Link
              className="-mx-2 flex h-[54px] items-center gap-3 rounded-[16px] px-2 transition hover:bg-surface-muted"
              href={`/transactions/${item.id}`}
              key={item.id}
            >
              <span
                className="grid size-9 shrink-0 place-items-center rounded-[12px]"
                style={categoryTile(item.categoryColor)}
              >
                <CategoryGlyph className="size-4" name={item.categoryIcon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-black text-foreground">
                  {transactionTitle(item) ??
                    t("Untitled transaction", "未命名交易")}
                </span>
                <span className="mt-0.5 block truncate text-[10px] font-bold text-muted">
                  {formatTransactionDate(item.transactionTime, false, locale)} ·{" "}
                  {item.categoryName ?? t("Uncategorized", "未分类")}
                </span>
              </span>
              <span
                className={`shrink-0 text-[12px] font-black tabular-nums ${
                  isIncoming(item.type) ? "text-income" : "text-foreground"
                }`}
              >
                {formatSignedMoney(
                  item.amountMinor,
                  isIncoming(item.type) ? "+" : "-",
                  item.currency,
                )}
              </span>
            </Link>
          ))
        ) : (
          <div className="grid h-full place-content-center text-center text-xs font-bold text-muted">
            {t("No transactions yet", "还没有交易")}
          </div>
        )}
      </div>
      <Link
        className="grid h-[38px] shrink-0 place-items-center text-[10px] font-black text-muted transition hover:text-accent-text"
        href="/transactions"
      >
        {t(
          `View all ${transactionCount} transactions >`,
          `查看全部 ${transactionCount} 笔交易 >`,
        )}
      </Link>
    </Card>
  );
}
