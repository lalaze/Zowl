import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { Translate } from "@/lib/i18n/locale";

export function PagerNav({
  ariaLabel,
  page,
  totalPages,
  previousHref,
  nextHref,
  t,
  showDisabledChevrons = false,
}: {
  ariaLabel: string;
  page: number;
  totalPages: number;
  previousHref: string;
  nextHref: string;
  t: Translate;
  showDisabledChevrons?: boolean;
}) {
  if (totalPages <= 1) return null;

  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav
      aria-label={ariaLabel}
      className="flex items-center justify-between gap-3 rounded-[20px] border-2 border-divider bg-surface px-3 py-2"
    >
      <Button
        asChild={hasPrevious}
        disabled={!hasPrevious}
        size="sm"
        variant="outline"
      >
        {hasPrevious ? (
          <Link href={previousHref}>
            <ChevronLeft className="size-4" />
            {t("Previous", "上一页")}
          </Link>
        ) : (
          <span>
            {showDisabledChevrons ? <ChevronLeft className="size-4" /> : null}
            {t("Previous", "上一页")}
          </span>
        )}
      </Button>
      <p className="text-sm font-bold text-muted">
        {t(
          `Page ${page} / ${totalPages} page`,
          `第 ${page} / ${totalPages} 页`,
        )}
      </p>
      <Button
        asChild={hasNext}
        disabled={!hasNext}
        size="sm"
        variant="outline"
      >
        {hasNext ? (
          <Link href={nextHref}>
            {t("Next", "下一页")}
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span>
            {t("Next", "下一页")}
            {showDisabledChevrons ? <ChevronRight className="size-4" /> : null}
          </span>
        )}
      </Button>
    </nav>
  );
}
