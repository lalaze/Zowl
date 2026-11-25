import { cookies, headers } from "next/headers";

import {
  defaultLocale,
  isLocale,
  localeCookieName,
  resolveLocale,
  translator,
  type LanguagePreference,
  type Locale,
  type Translate,
} from "./locale";

export type LocaleState = { locale: Locale; preference: LanguagePreference };

/**
 * The request's UI language: the saved cookie, else Accept-Language (which
 * the mobile app sets from its own language setting). Outside a request, such
 * as in unit tests calling route handlers directly, it falls back to English.
 */
export async function getLocaleState(): Promise<LocaleState> {
  try {
    const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
    const saved = cookieStore.get(localeCookieName)?.value;
    return {
      locale: resolveLocale(saved, headerList.get("accept-language")),
      preference: isLocale(saved) ? saved : "system",
    };
  } catch {
    return { locale: defaultLocale, preference: "system" };
  }
}

export async function getLocale(): Promise<Locale> {
  return (await getLocaleState()).locale;
}

export async function getT(): Promise<Translate> {
  return translator(await getLocale());
}
