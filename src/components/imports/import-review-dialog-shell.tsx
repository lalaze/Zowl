"use client";

import { X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, type ReactNode } from "react";

import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";

export function useImportReviewDialog(batchId: string, param: string) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const close = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete(param);
    const query = nextParams.toString();
    router.replace(
      `/imports/files/${batchId}/review${query ? `?${query}` : ""}`,
    );
  }, [batchId, param, router, searchParams]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close]);

  return { close, router };
}

export function ImportReviewDialogShell({
  backdropLabel,
  titleId,
  descriptionId,
  badge,
  subtitle,
  title,
  description,
  onClose,
  children,
}: {
  backdropLabel: string;
  titleId: string;
  descriptionId: string;
  badge: ReactNode;
  subtitle: string;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useT();

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label={backdropLabel}
        className="absolute inset-0 bg-slate-950/55"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] border-2 border-divider bg-surface sm:max-w-3xl sm:rounded-[24px]"
      >
        <div className="z-10 flex shrink-0 items-start justify-between gap-4 border-b-2 border-divider bg-surface px-5 py-4 sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {badge}
              <span className="text-xs font-semibold text-subtle">
                {subtitle}
              </span>
            </div>
            <h2
              id={titleId}
              className="mt-2 text-xl font-black text-foreground"
            >
              {title}
            </h2>
            <p
              id={descriptionId}
              className="mt-1 text-sm font-medium text-muted"
            >
              {description}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("Close", "关闭")}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth">
          {children}
        </div>
      </section>
    </div>
  );
}
