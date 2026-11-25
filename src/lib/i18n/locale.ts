/**
 * UI language shared by server and client code. Copy is written inline as
 * English/Chinese pairs: `t("Save", "保存")`.
 */
export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];

/** What the person picked; "system" follows the browser's languages. */
export type LanguagePreference = Locale | "system";

export const defaultLocale: Locale = "en";
export const localeCookieName = "zemoney-locale";
export const localeCookieMaxAgeSeconds = 60 * 60 * 24 * 365;

export type Translate = (en: string, zh: string) => string;

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh";
}

const pickEnglish: Translate = (en) => en;
const pickChinese: Translate = (_en, zh) => zh;

export function translator(locale: Locale): Translate {
  return locale === "zh" ? pickChinese : pickEnglish;
}

/** BCP 47 tag for `<html lang>`, `Intl.*` and `toLocaleString`. */
export function localeTag(locale: Locale) {
  return locale === "zh" ? "zh-CN" : "en-US";
}

/** First supported language in an Accept-Language header, by quality. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return defaultLocale;
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="));
      const quality = q ? Number(q.slice(2)) : 1;
      return {
        language: tag.trim().toLowerCase().split("-")[0],
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      };
    })
    .filter((entry) => entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const entry of ranked) {
    if (isLocale(entry.language)) return entry.language;
  }
  return defaultLocale;
}

export function resolveLocale(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  return isLocale(cookieValue) ? cookieValue : negotiateLocale(acceptLanguage);
}
