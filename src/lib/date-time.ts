export type DatetimeLocalPrecision = "minutes" | "seconds";

export function toDatetimeLocal(
  value: string | null | undefined,
  precision: DatetimeLocalPrecision = "seconds",
): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const adjusted = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return adjusted.toISOString().slice(0, precision === "minutes" ? 16 : 19);
}

export function localDayOfMonth(now: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      timeZone,
    }).format(now),
  );
}
