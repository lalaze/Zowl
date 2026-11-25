const MONEY_PATTERN = /^\+?(\d+)(?:\.(\d+))?$/;
const exponentCache = new Map<string, number>();

export class InvalidMoneyError extends Error {
  constructor(message = "Invalid amount format") {
    super(message);
    this.name = "InvalidMoneyError";
  }
}

export function currencyExponent(currency = "CNY"): number {
  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(code)) throw new InvalidMoneyError("Invalid currency format");
  const cached = exponentCache.get(code);
  if (cached !== undefined) return cached;
  const options = new Intl.NumberFormat("en", {
    style: "currency",
    currency: code,
  }).resolvedOptions();
  const exponent =
    options.maximumFractionDigits ?? options.minimumFractionDigits ?? 2;
  exponentCache.set(code, exponent);
  return exponent;
}

export function isSupportedCurrency(currency: string) {
  try {
    return currencyExponent(currency) === 2;
  } catch {
    return false;
  }
}

export function decimalToMinor(input: string, currency = "CNY"): number {
  if (!isSupportedCurrency(currency)) {
    throw new InvalidMoneyError("Only currencies with two decimal places are supported");
  }
  const normalized = input.normalize("NFKC").trim().replaceAll(",", "");
  const match = MONEY_PATTERN.exec(normalized);

  if (!match) {
    throw new InvalidMoneyError();
  }

  const [, whole, fraction = ""] = match;
  if (fraction.length > 2) throw new InvalidMoneyError();
  const value =
    Number.parseInt(whole, 10) * 100 +
    Number.parseInt(fraction.padEnd(2, "0") || "0", 10);

  if (!Number.isSafeInteger(value)) {
    throw new InvalidMoneyError("Amount exceeds the supported range");
  }

  return value;
}

export function minorToDecimal(amountMinor: number, currency = "CNY"): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new InvalidMoneyError("Minor currency units must be a nonnegative safe integer");
  }

  void currency;
  const whole = Math.floor(amountMinor / 100);
  const fraction = String(amountMinor % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function formatMoney(
  amountMinor: number,
  currency = "CNY",
  locale = "en-US",
) {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formatter
    .formatToParts(amountMinor / 100)
    .map((part) =>
      part.type === "minusSign" ? `${part.value}\u202f` : part.value,
    )
    .join("");
}

export function formatSignedMoney(
  amountMinor: number,
  sign: "+" | "-",
  currency = "CNY",
  locale = "en-US",
) {
  return `${sign}\u202f${formatMoney(Math.abs(amountMinor), currency, locale)}`;
}
