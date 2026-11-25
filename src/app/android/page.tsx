import {
  BellRing,
  ChevronRight,
  Download,
  FileCheck2,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
  Smartphone,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { Owl } from "@/components/brand/owl";
import { StoryScene } from "@/components/brand/story-scene";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { BrandMark } from "@/components/layout/brand-mark";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { translator } from "@/lib/i18n/locale";
import { getLocale, getT } from "@/lib/i18n/server";
import { readAndroidRelease } from "@/services/android-release-service";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Get Zowl for Android", "下载 Zowl Android 版"),
    description: t(
      "Download Zowl, the Android app for your zeMoney ledger, to record transactions from payment screenshots and payment pages.",
      "下载 Zowl —— zeMoney 账本的 Android 应用，用支付截图和支付页采集轻松记下每一笔。",
    ),
  };
}

const features = [
  {
    icon: ScanLine,
    title: "Screenshot recognition",
    titleZh: "截图识别",
    description: "Choose payment screenshots from your gallery, review the results, and confirm posting.",
    descriptionZh: "从相册选择支付截图，核对识别结果后再入账。",
    className: "bg-tint-sky text-[#1d4ed8] dark:text-[#8ab8ff]",
  },
  {
    icon: BellRing,
    title: "Automatic payment capture",
    titleZh: "支付自动采集",
    description: "Recognize Alipay and WeChat payment success pages, with Taobao, Pinduoduo, JD.com and Pupu as experimental sources. You confirm each transaction unless you turn on auto-posting.",
    descriptionZh: "识别支付宝、微信的支付成功页，淘宝、拼多多、京东、朴朴为实验性来源。除非你开启自动入账，每笔交易都由你确认。",
    className: "bg-tint-amber text-accent-text",
  },
  {
    icon: WalletCards,
    title: "Your ledger on the go",
    titleZh: "账本随身看",
    description: "View monthly finances, recent transactions, and category trends.",
    descriptionZh: "随时查看月度收支、最近交易和分类趋势。",
    className: "bg-tint-leaf text-income",
  },
] as const;

const installSteps = [
  {
    en: "Download APK then open the installation package from your system downloads.",
    zh: "下载 APK 后，在系统下载列表中打开安装包。",
  },
  {
    en: "Allow installation from this source when prompted.",
    zh: "按系统提示，允许安装来自此来源的应用。",
  },
  {
    en: "Open Zowl and sign in with your existing account.",
    zh: "打开 Zowl，用现有账号登录。",
  },
] as const;

function formatSize(sizeBytes: number) {
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function AndroidDownloadPage() {
  const locale = await getLocale();
  const t = translator(locale);
  const release = await readAndroidRelease();
  const apk = release
    ? {
        href: "/downloads/android/latest",
        version: release.manifest.version,
        label: t("Android Beta", "Android 测试版"),
        size: formatSize(release.manifest.sizeBytes),
        minimumAndroid: release.manifest.minAndroid,
        architecture: release.manifest.architectures.join(" / "),
        sha256: release.manifest.sha256,
      }
    : null;
  return (
    <main className="min-h-dvh overflow-hidden bg-app text-foreground">
      <header className="relative z-20 bg-app/95">
        <div className="mx-auto flex h-[74px] max-w-6xl items-center gap-4 px-5 sm:px-8">
          <Link
            aria-label={t("Zowl Home", "Zowl 首页")}
            className="flex items-center gap-2 whitespace-nowrap"
            href="/"
          >
            <BrandMark className="size-9" />
            <span className="text-lg font-black">Zowl</span>
          </Link>

          <span className="hidden h-6 w-px bg-divider sm:block" />
          <p className="hidden text-sm font-extrabold text-muted sm:block">
            {t("Android client", "Android 客户端")}
          </p>

          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeSwitcher />
            <Button
              asChild
              className="hidden h-10 rounded-[14px] px-4 sm:inline-flex"
              size="sm"
              variant="outline"
            >
              <Link href="/login">
                {t("Open web app", "打开网页版")}
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <StoryScene
        className="mx-3 rounded-[40px] [--owl-size:112px] sm:mx-5 sm:[--owl-size:144px]"
        time="night"
      >
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.04fr)_minmax(23rem,.76fr)] lg:gap-20 lg:py-24">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3.5 py-2 text-xs font-black text-[#1f2230]">
              <span className="size-2 rounded-full bg-income" />
              {apk
                ? `${apk.label} · v${apk.version}`
                : t("Android · Not available yet", "Android · 暂未开放")}
            </span>

            <h1 className="mt-7 text-[clamp(2.6rem,6vw,4.1rem)] font-black leading-[1.05]">
              {locale === "zh" ? (
                <>
                  每一分钱，
                  <br />
                  <span className="text-[#f5bd4f]">Zowl 都替你看着。</span>
                </>
              ) : (
                <>
                  Zowl keeps watch
                  <br />
                  <span className="text-[#f5bd4f]">over every coin.</span>
                </>
              )}
            </h1>
            <p className="scene-muted mt-6 max-w-xl text-base font-bold leading-8 sm:text-lg">
              {t(
                "The Android app for your ledger: screenshot recognition, automatic payment capture, and your monthly picture in your pocket. You confirm every candidate before it is posted.",
                "你的账本 Android 应用：截图识别、支付自动采集和每月收支全貌，都装进口袋。每条候选都先由你确认，再入账。",
              )}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              {apk ? (
                <Button asChild className="h-14 px-7 text-base" size="lg">
                  <a href={apk.href} download>
                    <Download className="size-5" />
                    {t("Download Android APK", "下载 Android APK")}
                  </a>
                </Button>
              ) : (
                <Button className="h-14 px-7 text-base" disabled size="lg">
                  {t("Not available yet", "暂未开放")}
                </Button>
              )}
              <p className="scene-muted flex items-center justify-center gap-2 text-xs font-bold sm:justify-start">
                <ShieldCheck className="size-4" />
                {t(
                  "Project build · Not distributed through an app store",
                  "项目自行构建 · 未经应用商店分发",
                )}
              </p>
            </div>
            {apk ? (
              <>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-extrabold text-[#1f2230]">
                  {[apk.minimumAndroid, apk.architecture, apk.size].map(
                    (item) => (
                      <span
                        className="rounded-full bg-white/85 px-3 py-1.5"
                        key={item}
                      >
                        {item}
                      </span>
                    ),
                  )}
                </div>
                <p className="scene-muted mt-3 break-all font-mono text-[10px] font-bold">
                  SHA-256: {apk.sha256}
                </p>
              </>
            ) : (
              <p className="scene-muted mt-4 text-sm font-bold">
                {t(
                  "No installation package has passed signature and integrity verification yet.",
                  "目前还没有通过签名和完整性校验的安装包。",
                )}
              </p>
            )}
          </div>

          {/* Real captures of the Flutter home screen, rendered by
              mobile/tool/capture_download_screens_test.dart. */}
          <div className="relative mx-auto w-[min(78vw,19rem)]">
            <div className="rounded-[46px] bg-[#15151b] p-2.5 shadow-[0_32px_80px_rgb(8_10_24/45%)] ring-1 ring-white/10">
              <div className="overflow-hidden rounded-[37px]">
                {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static capture */}
                <img
                  alt={t(
                    "Zowl home screen: monthly balance, daily spending, payments to review and recent transactions",
                    "Zowl 首页：本月结余、每日支出、待核对的支付和最近交易",
                  )}
                  className="block h-auto w-full dark:hidden"
                  height={1688}
                  src="/screenshots/zowl-home-light.png"
                  width={780}
                />
                {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static capture */}
                <img
                  alt={t("Zowl home screen in dark mode", "深色模式下的 Zowl 首页")}
                  className="hidden h-auto w-full dark:block"
                  height={1688}
                  src="/screenshots/zowl-home-dark.png"
                  width={780}
                />
              </div>
            </div>
          </div>
        </div>
      </StoryScene>

      <section className="mx-auto max-w-6xl px-5 pt-10 sm:px-8">
        <div className="flex items-start gap-4 rounded-[28px] bg-tint-amber p-5 sm:items-center sm:p-6">
          <Owl className="size-14" />
          <div>
            <h2 className="text-lg font-black">
              {t("Moving from the zeMoney app?", "还在用旧版 zeMoney App？")}
            </h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-muted">
              {t(
                "Zowl installs as a new app. Install it, sign in with the same account and turn automatic payment capture on again, then uninstall the old zeMoney app. Your ledger is online, so nothing is lost.",
                "Zowl 会作为一个新应用安装。装好后用同一账号登录，重新开启支付自动采集，再卸载旧的 zeMoney App 即可。账本保存在云端，数据不会丢失。",
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-black text-accent-text">
            {t("In your pocket: Zowl", "装进口袋的 Zowl")}
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.01em] sm:text-4xl">
            {t("Less typing, more confidence.", "少一点手动，多一点确定。")}
          </h2>
          <p className="mt-4 font-semibold leading-7 text-muted">
            {t(
              "Mobile and web share your account and ledger. You stay in control of important decisions.",
              "手机和网页共用同一个账号和账本，重要的决定始终由你来做。",
            )}
          </p>
        </div>

        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <Card className="p-5 sm:p-6" key={feature.title}>
              <span
                className={`grid size-12 place-items-center rounded-[17px] ${feature.className}`}
              >
                <feature.icon className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-black">
                {t(feature.title, feature.titleZh)}
              </h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-muted">
                {t(feature.description, feature.descriptionZh)}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,.82fr)_minmax(28rem,1.18fr)] lg:items-start lg:gap-14 lg:py-20">
          <div>
            <span className="grid size-14 place-items-center rounded-[20px] bg-tint-amber">
              <Smartphone className="size-6 text-accent-text" />
            </span>
            <h2 className="mt-6 text-3xl font-black tracking-[-0.01em]">
              {t("Install in three steps", "三步完成安装")}
            </h2>
            <p className="mt-4 text-sm font-semibold leading-7 text-muted">
              {t(
                "This is an APK direct-install beta; Android may show a security notice on first installation.",
                "这是 APK 直装的测试版，首次安装时 Android 可能会显示安全提醒。",
              )}
            </p>
          </div>

          <ol className="space-y-3">
            {installSteps.map((step, index) => (
              <li
                className="flex gap-4 rounded-[22px] bg-surface-muted p-4 sm:items-center sm:p-5"
                key={step.en}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-primary text-sm font-black text-on-primary">
                  {index + 1}
                </span>
                <p className="pt-2 text-sm font-bold leading-6 sm:pt-0">
                  {t(step.en, step.zh)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <Card className="overflow-hidden">
          <div className="grid lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,.92fr)]">
            <div className="p-6 sm:p-9 lg:p-11">
              <div className="flex items-center gap-3">
                <LockKeyhole className="size-6 text-income" />
                <p className="text-sm font-black text-income">
                  {t("Privacy boundary", "隐私边界")}
                </p>
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-[-0.01em] sm:text-3xl">
                {t(
                  "A captured payment is a candidate until it is confirmed.",
                  "采集到的付款先是候选，确认之后才是交易。",
                )}
              </h2>
              <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-muted">
                {t(
                  "Zowl uses Android accessibility access to read only the payment pages of the sources you enable. Page text and on-device screenshots are never saved or uploaded; chats, refunds, failures, and unclear amounts are ignored.",
                  "Zowl 通过 Android 无障碍权限，只读取你开启的来源的支付页面。页面文字和本机截图不保存、不上传；聊天、退款、失败和金额不明确的页面会直接忽略。",
                )}
              </p>
            </div>

            <div className="bg-tint-leaf p-6 sm:p-8">
              <ul className="space-y-4 text-sm font-extrabold">
                <li className="flex gap-3">
                  <FileCheck2 className="mt-0.5 size-5 shrink-0 text-income" />
                  {t("Review each candidate before posting", "每条候选逐一核对后才入账")}
                </li>
                <li className="flex gap-3">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-income" />
                  {t(
                    "Login credentials stay in system secure storage",
                    "登录凭据保存在系统安全存储中",
                  )}
                </li>
                <li className="flex gap-3">
                  <LockKeyhole className="mt-0.5 size-5 shrink-0 text-income" />
                  {t(
                    "Offline candidates use Android Keystore encryption",
                    "离线候选使用 Android Keystore 加密",
                  )}
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </section>

      <footer className="bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:px-8">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <BrandMark className="size-8" />
            <span className="font-black">Zowl</span>
          </div>
          <p className="text-xs font-semibold text-muted sm:ml-5">
            {apk
              ? `v${apk.version} · ${apk.minimumAndroid} · ${apk.architecture} · ${apk.size}`
              : t(
                  "Android installation package not yet available",
                  "Android 安装包暂未开放",
                )}
          </p>
          {apk ? (
            <Button asChild className="sm:ml-auto" size="sm">
              <a href={apk.href} download>
                <Download className="size-4" />
                {t("Download APK", "下载 APK")}
              </a>
            </Button>
          ) : (
            <Button className="sm:ml-auto" disabled size="sm">
              {t("Not available yet", "暂未开放")}
            </Button>
          )}
        </div>
      </footer>
    </main>
  );
}
