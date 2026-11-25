"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import {
  defaultLocale,
  translator,
  type LanguagePreference,
  type Locale,
  type Translate,
} from "@/lib/i18n/locale";

type I18nState = { locale: Locale; preference: LanguagePreference };

// Components rendered without the provider (unit tests, isolated previews)
// show English.
const I18nContext = createContext<I18nState>({
  locale: defaultLocale,
  preference: "system",
});

export function I18nProvider({
  locale,
  preference,
  children,
}: I18nState & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, preference }), [locale, preference]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}

export function useLanguagePreference(): LanguagePreference {
  return useContext(I18nContext).preference;
}

/** `const t = useT(); t("Save", "保存")` */
export function useT(): Translate {
  return translator(useLocale());
}
