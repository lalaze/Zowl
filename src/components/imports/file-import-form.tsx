"use client";

import { FileCheck2, FileSpreadsheet, LoaderCircle, ShieldCheck, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;

function formatFileSize(size: number) {
  return size < 1024 * 1024
    ? `${Math.ceil(size / 1024)} KiB`
    : `${(size / 1024 / 1024).toFixed(1)} MiB`;
}

export function FileImportForm() {
  const router = useRouter();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(candidate: File | undefined) {
    setError(null);
    if (!candidate) return;
    const extension = candidate.name.split(".").pop()?.toLowerCase();
    if (!extension || !["csv", "xlsx"].includes(extension)) {
      setError(t("Choose CSV or XLSX statement file", "请选择 CSV 或 XLSX 账单文件"));
      return;
    }
    if (!candidate.size || candidate.size > MAX_BYTES) {
      setError(t("File must be smaller than 10 MiB", "文件必须小于 10 MiB"));
      return;
    }
    setFile(candidate);
  }

  async function submit() {
    if (!file || pending) return;
    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("file", file);

    try {
      const response = await fetch("/api/imports/files", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        data?: { batchId: string };
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) {
        setError(payload.error?.message ?? t("File parsing failed. Check the file and try again", "文件解析失败，请检查后重试"));
        return;
      }
      router.push(`/imports/files/${payload.data.batchId}/review`);
      router.refresh();
    } catch {
      setError(t("Network connection failed. Try again later", "网络连接失败，请稍后重试"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div
        className={cn(
          "relative grid min-h-64 place-items-center rounded-[24px] border-2 border-dashed p-6 text-center transition",
          dragging
            ? "border-divider bg-tint-amber"
            : "border-divider bg-surface-muted hover:border-divider hover:bg-surface-muted",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          choose(event.dataTransfer.files[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(event) => choose(event.target.files?.[0])}
        />
        {file ? (
          <div className="w-full max-w-sm">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl border-2 border-divider bg-tint-amber text-foreground">
              <FileCheck2 className="size-6" />
            </span>
            <p className="mt-4 truncate font-black text-foreground">{file.name}</p>
            <p className="mt-1 text-sm font-medium text-muted">{formatFileSize(file.size)}</p>
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-danger"
              onClick={() => {
                setFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              <X className="size-4" />{t("Choose another file", "换一个文件")}
            </button>
          </div>
        ) : (
          <button type="button" className="group" onClick={() => inputRef.current?.click()}>
            <span className="mx-auto grid size-12 place-items-center rounded-2xl border-2 border-divider bg-surface text-foreground transition">
              <UploadCloud className="size-6" />
            </span>
            <span className="mt-4 block font-black text-foreground">{t("Click to select or drag a statement here", "点击选择，或把账单拖到这里")}</span>
            <span className="mt-1 block text-sm font-medium text-muted">{t("Supports Alipay, WeChat, and generic CSV / XLSX", "支持支付宝、微信和通用 CSV / XLSX")}</span>
          </button>
        )}
      </div>

      {error ? <div role="alert" className="rounded-2xl border-2 border-divider bg-tint-berry px-4 py-3 text-sm font-semibold text-danger">{error}</div> : null}

      <Button type="button" variant="default" size="lg" className="w-full" disabled={!file || pending} onClick={submit}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
        {pending ? t("Parsing securely…", "正在安全解析…") : t("Parse and preview", "解析并预览")}
      </Button>

      <div className="flex items-start gap-2 rounded-2xl border-2 border-divider bg-tint-leaf px-4 py-3 text-xs font-semibold leading-5 text-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-income" />
        {t(
          "Files are processed in local development storage. Formulas, macros, and embedded scripts are never executed. Confirmation is required before importing.",
          "文件在本地开发存储中处理，不会执行公式、宏或文件内脚本。导入前仍需由你确认。",
        )}
      </div>
    </div>
  );
}
