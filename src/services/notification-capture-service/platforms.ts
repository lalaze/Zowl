import type {
  CaptureOrderItem,
  notificationCapturePlatforms,
} from "@/db/schema";
import {
  isPaymentPageOcrParser,
  isPaymentPageParser,
} from "@/lib/capture-source";
import { translator, type Locale } from "@/lib/i18n/locale";
import type { NotificationCaptureEvent } from "@/services/notification-capture-service/schema";

export type CapturePlatform = (typeof notificationCapturePlatforms)[number];

export const packageForPlatform = {
  alipay: "com.eg.android.AlipayGphone",
  wechat: "com.tencent.mm",
  cmb: "cmb.pb",
  taobao: "com.taobao.taobao",
  pinduoduo: "com.xunmeng.pinduoduo",
  jd: "com.jingdong.app.mall",
  pupu: "com.pupumall.customer",
  xianyu: "com.taobao.idlefish",
} as const satisfies Record<CapturePlatform, string>;

// Only platforms that ever had a notification parser. The shopping apps are
// read from payment pages alone, which autoPostPaymentPages authorizes.
export const autoPostFieldForPlatform: Partial<
  Record<CapturePlatform, "autoPostAlipay" | "autoPostWechat" | "autoPostCmb">
> = {
  alipay: "autoPostAlipay",
  wechat: "autoPostWechat",
  cmb: "autoPostCmb",
};

// Written into the candidate's description and payment method in the language
// of the capture request. They are system defaults (field origin
// "system_default"), so a matching statement may replace them; nothing
// compares them by value, so old English and new Chinese rows mix safely.
export const labelForPlatform: Record<Locale, Record<CapturePlatform, string>> =
  {
    en: {
      alipay: "Alipay",
      wechat: "WeChat",
      cmb: "China Merchants Bank",
      taobao: "Taobao",
      pinduoduo: "Pinduoduo",
      jd: "JD.com",
      pupu: "Pupu",
      xianyu: "Xianyu",
    },
    zh: {
      alipay: "支付宝",
      wechat: "微信",
      cmb: "招商银行",
      taobao: "淘宝",
      pinduoduo: "拼多多",
      jd: "京东",
      pupu: "朴朴",
      xianyu: "闲鱼",
    },
  };

export function captureDescription(
  event: NotificationCaptureEvent,
  locale: Locale,
) {
  const t = translator(locale);
  const label = labelForPlatform[locale][event.platform];
  if (isPaymentPageOcrParser(event.parserId)) {
    return t(
      `${label} payment success page (on-device OCR)`,
      `${label}支付成功页（本地识别）`,
    );
  }
  if (isPaymentPageParser(event.parserId)) {
    return t(`${label} payment success page`, `${label}支付成功页`);
  }
  if (event.platform === "cmb") {
    return t("CMB debit notification", "招商银行扣费通知");
  }
  return t(`${label} payment notification`, `${label}支付通知`);
}

const ORDER_SUMMARY_NAME_LENGTH = 60;

/** The candidate's description once its goods are known: what was bought. */
export function orderSummary(items: CaptureOrderItem[], locale: Locale) {
  const t = translator(locale);
  const first = items[0]!.name.slice(0, ORDER_SUMMARY_NAME_LENGTH);
  if (items.length === 1) return first;
  return t(
    `${first} and ${items.length - 1} more`,
    `${first}等${items.length}件`,
  );
}

export const knownParserIdentities = {
  alipay: new Set([
    "alipay_payment_page_v1:1",
    "alipay_payment_page_ocr_v1:1",
    "alipay-payment-success:1",
    "alipay_success_v1:1",
    "alipay_expense_reminder_v1:1",
    "alipay_success_v2:2",
    "alipay_expense_reminder_v2:2",
  ]),
  wechat: new Set([
    "wechat-payment-success:1",
    "wechat_success_v1:1",
    "wechat_payment_page_v1:1",
    "wechat_payment_page_ocr_v1:1",
  ]),
  cmb: new Set(["cmb_debit_v1:1"]),
  // Node text of the embedded cashier, or its amount confirmed by OCR of the result page.
  taobao: new Set(["taobao_payment_page_v1:1", "taobao_payment_page_ocr_v1:1"]),
  pinduoduo: new Set(["pinduoduo_payment_page_v1:1"]),
  jd: new Set(["jd_payment_page_v1:1"]),
  // The checkout amount, confirmed by the app once the order goes through.
  pupu: new Set(["pupu_payment_page_v1:1"]),
  // Node text or OCR of the embedded cashier, or its amount confirmed by the result page.
  xianyu: new Set(["xianyu_payment_page_v1:1", "xianyu_payment_page_ocr_v1:1"]),
} satisfies Record<keyof typeof packageForPlatform, ReadonlySet<string>>;
