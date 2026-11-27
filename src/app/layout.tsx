import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";

import { I18nProvider } from "@/components/i18n/i18n-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import {
  accentBootScript,
  defaultAccentColor,
} from "@/lib/accent-theme";
import { localeTag } from "@/lib/i18n/locale";
import {
  getLocaleStateForRender,
  getTForRender,
} from "@/lib/i18n/server";

import "./globals.css";

// Rounded type that matches the owl (SIL Open Font License, see fonts/).
const nunito = localFont({
  src: [
    { path: "./fonts/Nunito-Regular.ttf", weight: "400" },
    { path: "./fonts/Nunito-Medium.ttf", weight: "500" },
    { path: "./fonts/Nunito-SemiBold.ttf", weight: "600" },
    { path: "./fonts/Nunito-Bold.ttf", weight: "700" },
    { path: "./fonts/Nunito-ExtraBold.ttf", weight: "800" },
    { path: "./fonts/Nunito-Black.ttf", weight: "900" },
  ],
  variable: "--font-nunito",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTForRender();
  return {
    title: {
      default: t(
        "Zowl · See every transaction clearly",
        "Zowl · 每一笔都清清楚楚",
      ),
      template: "%s · Zowl",
    },
    description: t(
      "A personal finance app with quick imports from payment screenshots, Alipay, and WeChat statements.",
      "个人记账应用，可从支付截图、支付宝和微信账单快速导入。",
    ),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1e8" },
    { media: "(prefers-color-scheme: dark)", color: "#15151b" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { locale, preference } = await getLocaleStateForRender();
  return (
    <html
      className={nunito.variable}
      data-accent={defaultAccentColor}
      lang={localeTag(locale)}
      suppressHydrationWarning
    >
      <head>
        <Script
          dangerouslySetInnerHTML={{ __html: accentBootScript }}
          id="zowl-accent-boot"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        <I18nProvider locale={locale} preference={preference}>
          <ThemeProvider>{children}</ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
