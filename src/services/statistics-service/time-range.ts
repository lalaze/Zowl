const MONTH_PATTERN = /^([1-9]\d{3})-(0[1-9]|1[0-2])$/;

export class StatisticsInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatisticsInputError";
  }
}

export type CalendarMonth = { year: number; month: number };

export function parseMonth(month: string): CalendarMonth {
  const match = MONTH_PATTERN.exec(month);
  if (!match) throw new StatisticsInputError("Month format must be YYYY-MM");
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function monthKey({ year, month }: CalendarMonth) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function moveMonth(value: CalendarMonth, offset: number): CalendarMonth {
  const date = new Date(Date.UTC(value.year, value.month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function assertTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
  } catch {
    throw new StatisticsInputError("Invalid user time zone");
  }
}

function zonedDateTimeToUtc(
  value: CalendarMonth & {
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
  },
  timeZone: string,
) {
  const desired = Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour ?? 0,
    value.minute ?? 0,
    value.second ?? 0,
  );
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  let candidate = desired;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const observedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const adjustment = desired - observedAsUtc;
    candidate += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(candidate);
}

export function getMonthRange(month: string, timeZone: string) {
  assertTimeZone(timeZone);
  const current = parseMonth(month);
  const previous = moveMonth(current, -1);
  const next = moveMonth(current, 1);
  return {
    month,
    start: zonedDateTimeToUtc({ ...current, day: 1 }, timeZone).toISOString(),
    end: zonedDateTimeToUtc({ ...next, day: 1 }, timeZone).toISOString(),
    previousMonth: monthKey(previous),
    previousStart: zonedDateTimeToUtc(
      { ...previous, day: 1 },
      timeZone,
    ).toISOString(),
  };
}

export function getCurrentMonthInTimeZone(now: Date, timeZone: string) {
  assertTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new StatisticsInputError("Cannot calculate the current month");
  return `${year}-${month}`;
}

export function localDateKey(isoValue: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoValue));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function monthLabel(month: string) {
  const { year, month: monthNumber } = parseMonth(month);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

export function getTrailingMonthRanges(
  month: string,
  timeZone: string,
  count = 6,
) {
  const calendarMonth = parseMonth(month);
  return Array.from({ length: count }, (_, index) => {
    const key = monthKey(moveMonth(calendarMonth, index - count + 1));
    const range = getMonthRange(key, timeZone);
    return { month: key, start: range.start, end: range.end };
  });
}
