import { KeyRound, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SetupForm } from "@/components/auth/setup-form";
import { Owl } from "@/components/brand/owl";
import { BrandMark } from "@/components/layout/brand-mark";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { getCurrentUserForRender } from "@/lib/auth/session";
import { translator } from "@/lib/i18n/locale";
import { getLocaleForRender, getTForRender } from "@/lib/i18n/server";
import { setupService } from "@/services/setup-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTForRender();
  return { title: t("Initialize administrator", "初始化管理员") };
}
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const user = await getCurrentUserForRender();
  if (user) redirect("/");
  if (setupService.isInitialized()) redirect("/login");
  const locale = await getLocaleForRender();
  const t = translator(locale);

  return (
    <main className="relative grid min-h-dvh overflow-hidden bg-app lg:grid-cols-[minmax(0,0.8fr)_minmax(34rem,1.2fr)]">
      <div className="absolute right-4 top-4 z-20 flex gap-2 sm:right-6 sm:top-6">
        <LanguageSwitcher />
        <ThemeSwitcher />
      </div>
      <section className="relative m-4 hidden overflow-hidden rounded-[40px] bg-tint-leaf p-12 text-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <BrandMark className="size-10" />
          <span className="text-xl font-black">Zowl</span>
        </div>
        <div className="relative z-10 max-w-lg">
          <span className="grid size-14 place-items-center rounded-2xl bg-surface">
            <ShieldCheck className="size-7 text-income" />
          </span>
          <h1 className="mt-7 text-5xl font-black leading-[1.12] tracking-[-0.01em]">
            {locale === "zh" ? (
              <>
                创建唯一的
                <br />
                系统管理员。
              </>
            ) : (
              <>
                Create the sole
                <br />
                system administrator.
              </>
            )}
          </h1>
          <p className="mt-6 max-w-md text-base font-medium leading-7 text-muted">
            {t(
              "Administrators create, reset, and disable accounts. They cannot view other users’ ledgers or files.",
              "管理员只负责创建、重置和停用账号，无法查看其他用户的账本和文件。",
            )}
          </p>
        </div>
        <Owl className="w-44 self-end" />
      </section>

      <section className="relative flex items-center justify-center px-5 py-20 sm:px-8 lg:py-12">
        <div className="w-full max-w-[38rem]">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <BrandMark className="size-10" />
            <span className="text-lg font-black">Zowl</span>
          </div>
          <div className="rounded-[24px] border-2 border-divider bg-surface p-5 sm:p-7">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl border-2 border-divider bg-tint-amber">
                <KeyRound className="size-5" />
              </span>
              <div>
                <h1 className="text-2xl font-black tracking-[-0.01em] text-foreground">
                  {t("First-time setup", "首次初始化")}
                </h1>
                <p className="mt-1 text-sm font-medium leading-6 text-muted">
                  {t(
                    "Verify the deployment secret and create the administrator account. This setup closes permanently after success.",
                    "验证部署密钥并创建管理员账号。初始化成功后，此入口将永久关闭。",
                  )}
                </p>
              </div>
            </div>
            <SetupForm />
          </div>
        </div>
      </section>
    </main>
  );
}
