import { SearchX } from "lucide-react";
import Link from "next/link";

import { Owl } from "@/components/brand/owl";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <main className="grid min-h-[60dvh] place-items-center p-6 text-center">
      <div className="w-full max-w-md rounded-[28px] border-2 border-divider bg-surface p-8">
        <Owl className="mx-auto w-24" />
        <span className="mx-auto mt-4 grid size-12 place-items-center rounded-2xl border-2 border-divider bg-tint-sky text-foreground">
          <SearchX className="size-6" />
        </span>
        <h1 className="mt-5 text-2xl font-black text-foreground">{t("Record not found", "没有找到这条记录")}</h1>
        <p className="mt-2 text-sm font-semibold text-muted">{t("It may have been deleted or may belong to another account.", "它可能已被删除，或属于其他账号。")}</p>
        <Button asChild className="mt-6"><Link href="/transactions">{t("Back to transactions", "返回交易")}</Link></Button>
      </div>
    </main>
  );
}
