import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "@/db/client";
import { notificationCaptures, transactions } from "@/db/schema";
import { isPaymentPageParser } from "@/lib/capture-source";
import { normalizeMerchantName } from "@/lib/merchant";
import type { createNotificationCaptureConfirmation } from "@/services/notification-capture-service/confirmation";
import { autoPostFieldForPlatform } from "@/services/notification-capture-service/platforms";
import {
  getCaptureRow,
  type StagedCapture,
} from "@/services/notification-capture-service/projection";
import type { NotificationCaptureSettings } from "@/services/notification-capture-service/settings";

// 同一规范商户累计 5 笔未修正、未作废的自动入账后视为可信商户，
// 可信商户的自动入账上限放宽到 autoPostTrustedMaxAmountMinor。
const TRUSTED_MERCHANT_MIN_AUTO_POSTS = 5;

type ConfirmParsedOn = ReturnType<
  typeof createNotificationCaptureConfirmation
>["confirmParsedOn"];

export function createNotificationCaptureAutomation(
  database: Database,
  confirmParsedOn: ConfirmParsedOn,
) {
  // 可信商户：同一规范商户已有足够数量未修正（revisionNumber 保持 1）、
  // 未作废的自动入账交易时，自动入账上限放宽到可信上限。
  function isTrustedMerchant(userId: string, merchantName: string | null) {
    const normalized = normalizeMerchantName(merchantName);
    if (!normalized) return false;
    const rows = database
      .select({ merchantName: transactions.merchantName })
      .from(notificationCaptures)
      .innerJoin(
        transactions,
        eq(notificationCaptures.resultTransactionId, transactions.id),
      )
      .where(
        and(
          eq(notificationCaptures.userId, userId),
          eq(notificationCaptures.resultCode, "AUTO_POSTED"),
          eq(transactions.revisionNumber, 1),
          isNull(transactions.voidedAt),
        ),
      )
      .all();
    const proven = rows.filter(
      (row) => normalizeMerchantName(row.merchantName) === normalized,
    ).length;
    return proven >= TRUSTED_MERCHANT_MIN_AUTO_POSTS;
  }

  // 通知自动入账授权：该平台已授权时，确定重复的候选在接收时直接关联既有
  // 正式交易（结果码 AUTO_SKIPPED_DUPLICATE）；候选唯一且金额不超过上限
  // （可信商户放宽到可信上限）时直接确认入账（结果码 AUTO_POSTED）。
  // 疑似重复、超限与未授权平台的候选保持人工审核。
  function finalizeAutomation(
    userId: string,
    item: StagedCapture,
    settings: NotificationCaptureSettings,
  ) {
    const capture = getCaptureRow(database, userId, item.captureId);
    if (!capture) return;
    const notificationField = autoPostFieldForPlatform[item.platform];
    if (
      isPaymentPageParser(capture.parserId)
        ? !settings.autoPostPaymentPages
        : !notificationField || !settings[notificationField]
    ) {
      return;
    }

    if (item.duplicateStatus === "duplicate") {
      const confirmation = confirmParsedOn(database, userId, item.captureId, {
        decision: "post",
      });
      if (
        confirmation.status === "completed" &&
        confirmation.outcome.outcome === "duplicate"
      ) {
        database
          .update(notificationCaptures)
          .set({
            resultCode: "AUTO_SKIPPED_DUPLICATE",
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(notificationCaptures.id, item.captureId),
              eq(notificationCaptures.userId, userId),
            ),
          )
          .run();
      }
      return;
    }

    if (item.duplicateStatus !== "unique") return;
    const cap = isTrustedMerchant(userId, item.facts.merchantName)
      ? settings.autoPostTrustedMaxAmountMinor
      : settings.autoPostMaxAmountMinor;
    if (item.facts.amountMinor > cap) return;
    const confirmation = confirmParsedOn(database, userId, item.captureId, {
      decision: "post",
    });
    if (
      confirmation.status === "completed" &&
      confirmation.outcome.outcome === "posted"
    ) {
      database
        .update(notificationCaptures)
        .set({
          resultCode: "AUTO_POSTED",
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(notificationCaptures.id, item.captureId),
            eq(notificationCaptures.userId, userId),
          ),
        )
        .run();
    }
  }

  return { finalizeAutomation };
}
