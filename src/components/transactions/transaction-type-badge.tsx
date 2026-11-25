"use client";

import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, RotateCcw } from "lucide-react";

import { useLocale } from "@/components/i18n/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { transactionTypeLabel } from "@/lib/transaction-display";
import { cn } from "@/lib/utils";
import type { TransactionView } from "@/types/transaction";

const icons = {
  expense: ArrowUpRight,
  income: ArrowDownLeft,
  transfer: ArrowLeftRight,
  refund: RotateCcw,
};

/** Tinted type badges: money in is green, money out stays neutral. */
const pastelStyles: Record<TransactionView["type"], string> = {
  expense: "bg-surface-muted text-muted",
  income: "bg-tint-leaf text-income",
  transfer: "bg-tint-amber text-foreground",
  refund: "bg-tint-leaf text-income",
};

export function TransactionTypeBadge({ type }: { type: TransactionView["type"] }) {
  const locale = useLocale();
  const Icon = icons[type];
  return (
    <Badge
      className={cn("gap-1", pastelStyles[type])}
    >
      <Icon className="size-3" />
      {transactionTypeLabel(type, locale)}
    </Badge>
  );
}
