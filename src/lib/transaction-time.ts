export function normalizeTransactionTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    throw new RangeError("Invalid transaction time format");
  }
  return new Date(timestamp).toISOString();
}
