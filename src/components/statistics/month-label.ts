import { localeTag, type Locale } from "@/lib/i18n/locale";

function monthStart(month: string) {
  const [year, monthNumber] = month.split("-");
  return new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1));
}

/** "2026-07" → "July 2026" / "2026年7月". */
export function monthLabel(month: string, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(monthStart(month));
}

/** "2026-07" → "Jul" / "7月". */
export function shortMonthLabel(month: string, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    month: "short",
    timeZone: "UTC",
  }).format(monthStart(month));
}
