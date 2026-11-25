import { ArrowLeft, FileSpreadsheet, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FileImportForm } from "@/components/imports/file-import-form";
import { ImportStepper } from "@/components/imports/import-stepper";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("File import", "文件导入") };
}

const limits = [
  { en: "Maximum file size: 10 MiB", zh: "文件不超过 10 MiB" },
  { en: "Maximum rows per batch: 10,000 rows", zh: "单批最多 10,000 行" },
  { en: "Parse only CSV / XLSX", zh: "仅解析 CSV / XLSX" },
] as const;

export default async function FileImportPage() {
  const t = await getT();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/imports"><ArrowLeft className="size-4" />{t("Back to import", "返回导入")}</Link></Button>
      <PageHeader
        title={t("Import a statement file", "导入账单文件")}
        description={t(
          "Detect Alipay, WeChat, and generic spreadsheets automatically. Review each row before posting.",
          "自动识别支付宝、微信和通用表格，入账前可以逐行核对。",
        )}
      />
      <Card><CardContent className="p-5 sm:p-6"><ImportStepper current={1} /></CardContent></Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl border-2 border-divider bg-tint-amber text-foreground"><FileSpreadsheet className="size-4" /></span>{t("Choose a statement file", "选择账单文件")}</CardTitle></CardHeader>
        <CardContent><FileImportForm /></CardContent>
      </Card>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        {limits.map((item) => <div key={item.en} className="flex items-center gap-2 rounded-2xl border-2 border-divider bg-surface px-3 py-2.5 text-xs font-bold text-muted"><ShieldCheck className="size-4 shrink-0 text-income" />{t(item.en, item.zh)}</div>)}
      </div>
    </div>
  );
}
