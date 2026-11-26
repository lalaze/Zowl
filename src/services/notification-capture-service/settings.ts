import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { notificationCaptureSettings } from "@/db/schema";
import {
  notificationCaptureSettingsInputSchema,
  type NotificationCaptureSettingsInput,
} from "@/services/notification-capture-service/schema";

export type NotificationCaptureSettings = {
  autoPostAlipay: boolean;
  autoPostWechat: boolean;
  autoPostCmb: boolean;
  autoPostPaymentPages: boolean;
  autoPostMaxAmountMinor: number;
  autoPostTrustedMaxAmountMinor: number;
};

const defaultCaptureSettings: NotificationCaptureSettings = {
  autoPostAlipay: false,
  autoPostWechat: false,
  autoPostCmb: false,
  autoPostPaymentPages: false,
  autoPostMaxAmountMinor: 50_000,
  autoPostTrustedMaxAmountMinor: 500_000,
};

export function createNotificationCaptureSettings(database: Database) {
  function getSettings(userId: string): NotificationCaptureSettings {
    const row = database
      .select()
      .from(notificationCaptureSettings)
      .where(eq(notificationCaptureSettings.userId, userId))
      .get();
    if (!row) return { ...defaultCaptureSettings };
    return {
      autoPostAlipay: row.autoPostAlipay,
      autoPostWechat: row.autoPostWechat,
      autoPostCmb: row.autoPostCmb,
      autoPostPaymentPages: row.autoPostPaymentPages,
      autoPostMaxAmountMinor: row.autoPostMaxAmountMinor,
      autoPostTrustedMaxAmountMinor: row.autoPostTrustedMaxAmountMinor,
    };
  }

  function updateSettings(
    userId: string,
    rawInput: unknown,
  ): NotificationCaptureSettings {
    const input: NotificationCaptureSettingsInput =
      notificationCaptureSettingsInputSchema.parse(rawInput);
    const next = { ...getSettings(userId), ...input };
    const now = new Date().toISOString();
    database
      .insert(notificationCaptureSettings)
      .values({ userId, ...next, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: notificationCaptureSettings.userId,
        set: { ...next, updatedAt: now },
      })
      .run();
    return next;
  }

  return { getSettings, updateSettings };
}
