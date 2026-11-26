import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { StoryScene, sceneTimeFor } from "@/components/brand/story-scene";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { getCurrentUserForRender } from "@/lib/auth/session";
import { getTForRender } from "@/lib/i18n/server";
import { setupService } from "@/services/setup-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTForRender();
  return { title: t("Sign in", "登录") };
}

export default async function LoginPage() {
  const user = await getCurrentUserForRender();
  if (user) redirect("/");
  if (!setupService.isInitialized()) redirect("/setup");
  const t = await getTForRender();

  const isDevelopment = process.env.NODE_ENV === "development";
  const defaultEmail = isDevelopment
    ? (process.env.DEMO_EMAIL ?? "demo@zemoney.local")
    : "";
  const defaultPassword = isDevelopment
    ? (process.env.DEMO_PASSWORD ?? "zemoney-demo")
    : "";

  return (
    <main className="relative grid min-h-dvh bg-app lg:grid-cols-[minmax(0,1fr)_minmax(32rem,1fr)]">
      <div className="absolute right-4 top-4 z-20 flex gap-2 sm:right-6 sm:top-6">
        <LanguageSwitcher className="bg-white/85 text-[#1f2230] lg:bg-surface lg:text-foreground" />
        <ThemeSwitcher className="bg-white/85 text-[#1f2230] lg:bg-surface lg:text-foreground" />
      </div>

      <StoryScene
        className="rounded-b-[36px] px-6 pb-24 pt-6 [--owl-size:112px] sm:px-10 lg:m-4 lg:rounded-[40px] lg:p-12 lg:[--owl-size:176px]"
        contentClassName="lg:flex lg:h-full lg:flex-col lg:justify-between lg:pb-40"
        time={sceneTimeFor(new Date().getHours())}
      >
        <span className="text-xl font-black">Zowl</span>
        <div className="mt-8 max-w-[62%] lg:mt-0 lg:max-w-md">
          <h1 className="text-[2.2rem] font-black leading-[1.1] sm:text-[2.6rem] lg:text-5xl">
            {t("Welcome back", "欢迎回来")}
          </h1>
          <p className="scene-muted mt-3 text-base font-bold leading-7">
            {t(
              "Keep track of everyday life, one transaction at a time.",
              "一笔一笔，记下认真生活的样子。",
            )}
          </p>
        </div>
        <p className="scene-muted mt-6 hidden items-center gap-2 text-sm font-bold lg:flex">
          <ShieldCheck className="size-4" />
          {t(
            "Imports are posted only after your confirmation",
            "导入内容经你确认后才会入账",
          )}
        </p>
      </StoryScene>

      <section className="relative -mt-10 flex items-start justify-center px-4 pb-16 sm:px-8 lg:mt-0 lg:items-center lg:py-12">
        <div className="w-full max-w-[30rem]">
          <div className="rounded-[28px] bg-surface p-5 sm:p-7">
            <h2 className="text-xl font-black text-foreground">
              {t("Sign in to Zowl", "登录 Zowl")}
            </h2>
            <p className="mt-1.5 text-sm font-medium leading-6 text-muted">
              {isDevelopment
                ? t(
                    "Demo credentials are prefilled. Sign in to try it.",
                    "已填好演示账号，直接登录即可体验。",
                  )
                : t("Enter your email and password.", "请输入邮箱和密码。")}
            </p>

            <LoginForm
              defaultEmail={defaultEmail}
              defaultPassword={defaultPassword}
            />
          </div>

          {isDevelopment ? (
            <p className="mt-5 rounded-2xl bg-tint-amber px-4 py-3 text-xs font-semibold leading-5 text-muted">
              {t(
                "Local development mode. Demo credentials are for development only.",
                "当前为本地开发模式，演示账号仅用于开发环境。",
              )}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
