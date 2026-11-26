/** Explicit parser registrations determine provenance; clients cannot relabel a source. */
const nodePageParsers = new Set([
  "alipay_payment_page_v1",
  "wechat_payment_page_v1",
  "taobao_payment_page_v1",
  "pinduoduo_payment_page_v1",
  "jd_payment_page_v1",
  "pupu_payment_page_v1",
  "xianyu_payment_page_v1",
]);

/** Same success page, but read by on-device OCR of a window screenshot instead of accessibility nodes. */
const ocrPageParsers = new Set([
  "alipay_payment_page_ocr_v1",
  "wechat_payment_page_ocr_v1",
  "taobao_payment_page_ocr_v1",
  "xianyu_payment_page_ocr_v1",
]);

export function isPaymentPageOcrParser(parserId: string) {
  return ocrPageParsers.has(parserId);
}

export function isPaymentPageParser(parserId: string) {
  return nodePageParsers.has(parserId) || ocrPageParsers.has(parserId);
}

export function captureSourceKind(parserId: string) {
  return isPaymentPageParser(parserId)
    ? "payment_page_capture" as const
    : "notification_capture" as const;
}
