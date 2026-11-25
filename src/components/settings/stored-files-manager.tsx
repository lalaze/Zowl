"use client";

import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileSpreadsheet,
  Image,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getApiError, readApiPayload } from "@/lib/client-api";
import { localeTag, type Locale } from "@/lib/i18n/locale";

export type ManagedStoredFile = {
  id: string;
  kind: "bill" | "screenshot";
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  createdAt: string;
  transactionCount: number;
  importBatchCount: number;
  recognitionItemCount: number;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function formatDate(value: string, timezone: string, locale: Locale) {
  try {
    return new Intl.DateTimeFormat(localeTag(locale), {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function StoredFilesManager({
  initialFiles,
  pagination,
  timezone,
}: {
  initialFiles: ManagedStoredFile[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  timezone: string;
}) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const [files, setFiles] = useState(initialFiles);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(file: ManagedStoredFile) {
    const references =
      file.transactionCount + file.importBatchCount + file.recognitionItemCount;
    const prompt = references
      ? t(
          `Delete the original file “${file.originalName}”? Its ${references} transaction and import references will be retained, but the original image or statement will no longer open.`,
          `确定删除「${file.originalName}」的原始内容吗？${references} 条交易和导入引用会保留，但之后无法再打开原图或原账单。`,
        )
      : t(
          `Delete “${file.originalName}”? This removes the original file content.`,
          `确定删除「${file.originalName}」吗？此操作会移除原始文件内容。`,
        );
    if (!window.confirm(prompt)) return;

    setPendingId(file.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/settings/files/${file.id}`, {
        method: "DELETE",
      });
      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(getApiError(payload, t("Failed to delete file. Try again later", "文件删除失败，请稍后重试")));
      }
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setMessage(
        references
          ? t(
              "Original content deleted. Existing transactions and import records are retained.",
              "原始内容已删除，已有交易和导入记录仍会保留。",
            )
          : t("File securely deleted.", "文件已安全删除。"),
      );
      if (files.length === 1 && pagination.page > 1) {
        router.replace(
          pagination.page === 2
            ? "/settings"
            : `/settings?page=${pagination.page - 1}`,
        );
      } else {
        router.refresh();
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t("Network connection failed", "网络连接失败"),
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>{t("Original images and statements", "原图与账单文件")}</CardTitle>
        <CardDescription>
          {t(
            "Files are visible only to this account. Deleting original content keeps existing transactions and import records; source links become unavailable.",
            "文件只对当前账号可见。删除原始内容不会删除已生成的交易或导入记录，但来源链接会失效。",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(error || message) && (
          <div
            role={error ? "alert" : "status"}
            className={`rounded-2xl border-2 px-4 py-3 text-sm font-semibold ${
              error
                ? "border-divider bg-tint-berry text-danger"
                : "border-divider bg-tint-leaf text-foreground"
            }`}
          >
            {error ?? message}
          </div>
        )}
        {files.length ? (
          <div className="divide-y divide-divider-subtle">
            {files.map((file) => {
              const Icon = file.kind === "screenshot" ? Image : FileSpreadsheet;
              return (
                <article
                  key={file.id}
                  className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <span className={`grid size-11 shrink-0 place-items-center rounded-2xl border-2 border-divider text-foreground ${file.kind === "screenshot" ? "bg-tint-sky" : "bg-tint-leaf"}`}>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1 basis-[13rem]">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-bold text-foreground">
                        {file.originalName}
                      </p>
                      <Badge variant={file.kind === "screenshot" ? "info" : "default"}>
                        {file.kind === "screenshot" ? t("screenshots", "截图") : t("Transactions", "账单")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {formatBytes(file.size)} · {file.extension.toUpperCase()} · {formatDate(file.createdAt, timezone, locale)}
                    </p>
                    <p className="text-xs leading-5 text-muted">
                      {t(
                        `${file.transactionCount} transactions · ${file.importBatchCount} statement imports · ${file.recognitionItemCount} recognition items`,
                        `${file.transactionCount} 笔交易 · ${file.importBatchCount} 次账单导入 · ${file.recognitionItemCount} 个识别项`,
                      )}
                    </p>
                  </div>
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`/api/files/${file.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="size-4" /> {t("View original file", "查看原文件")}
                      </a>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      disabled={pendingId !== null}
                      onClick={() => remove(file)}
                    >
                      <Trash2 className="size-4" />
                      {pendingId === file.id ? t("Deleting…", "删除中…") : t("Delete", "删除")}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="rounded-2xl bg-surface-muted px-4 py-8 text-center text-sm text-muted">
            {t("No retained images or statement files yet.", "还没有保留的原图或账单文件。")}
          </p>
        )}
        {pagination.totalPages > 1 ? (
          <nav
            aria-label={t("Original file pagination", "原始文件分页")}
            className="flex items-center justify-between gap-3 border-t-2 border-divider pt-4"
          >
            <Button
              asChild={pagination.page > 1}
              disabled={pagination.page <= 1}
              size="sm"
              variant="outline"
            >
              {pagination.page > 1 ? (
                <Link
                  href={
                    pagination.page === 2
                      ? "/settings"
                      : `/settings?page=${pagination.page - 1}`
                  }
                >
                  <ChevronLeft className="size-4" />{t("Previous", "上一页")}
                </Link>
              ) : (
                <span><ChevronLeft className="size-4" />{t("Previous", "上一页")}</span>
              )}
            </Button>
            <p className="text-center text-xs font-medium text-slate-500">
              {t(
                `Total ${pagination.total} files · Page ${pagination.page} / ${pagination.totalPages} page`,
                `共 ${pagination.total} 个文件 · 第 ${pagination.page} / ${pagination.totalPages} 页`,
              )}
            </p>
            <Button
              asChild={pagination.page < pagination.totalPages}
              disabled={pagination.page >= pagination.totalPages}
              size="sm"
              variant="outline"
            >
              {pagination.page < pagination.totalPages ? (
                <Link href={`/settings?page=${pagination.page + 1}`}>
                  {t("Next", "下一页")}<ChevronRight className="size-4" />
                </Link>
              ) : (
                <span>{t("Next", "下一页")}<ChevronRight className="size-4" /></span>
              )}
            </Button>
          </nav>
        ) : null}
      </CardContent>
    </Card>
  );
}
