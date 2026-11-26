package com.zowl.mobile.capture

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.annotation.StringRes
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import com.zowl.mobile.MainActivity
import com.zowl.mobile.NativeLanguage
import com.zowl.mobile.R

/**
 * Notification text is looked up through [NativeLanguage.localized] ("strings" below), so it
 * follows the language chosen in the app; [Context] itself is kept for everything else.
 */
object CaptureNotificationPublisher {
    const val ROUTE_EXTRA = "zemoney_capture_route"
    const val REMOTE_INPUT_MERCHANT = "zemoney_quick_confirm_merchant"
    private const val CHANNEL_ID = "payment_capture_review"
    private const val CAPTURE_GROUP = "zemoney_payment_capture_review"
    private const val GROUP_NOTIFICATION_ID = 41201
    private const val AUTH_NOTIFICATION_ID = 41202
    // The listener-health channel of builds that still read notifications; only ever deleted.
    private const val RETIRED_HEALTH_CHANNEL_ID = "payment_capture_health"
    private const val LOCAL_OCR_NOTIFICATION_ID = 41204
    private const val PAYMENT_CODE_NOTIFICATION_ID = 41205
    // A question about a payment from a while ago is no longer worth asking.
    private const val PAYMENT_CODE_REMINDER_TIMEOUT = 30 * 60 * 1000L
    private const val NOTIFICATION_IDS_PREFERENCES = "zemoney_capture_notification_ids"
    private const val CAPTURE_NOTIFICATION_IDS = "capture_notification_ids"

    fun showCaptureReview(
        context: Context,
        platform: String = "alipay",
        captureId: String,
        amountMinor: Long,
        merchantName: String?,
        ownerUserId: String,
    ) {
        if (!canNotify(context)) return
        val strings = NativeLanguage.localized(context)
        ensureChannel(context, strings)
        val manager = context.getSystemService(NotificationManager::class.java)
        val actionIntent = quickConfirmIntent(context, captureId, ownerUserId)
        val sourceLabel = sourceLabel(strings, platform)
        val addMerchant = strings.getString(R.string.capture_add_merchant_and_post)
        val builder =
            NotificationCompat
                .Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(
                    strings.getString(R.string.capture_review_title, sourceLabel, formatAmount(amountMinor)),
                ).setContentText(merchantName ?: addMerchant)
                .setGroup(CAPTURE_GROUP)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(publicCaptureNotification(context, strings))
                .setContentIntent(routeIntent(context, "/imports/notifications"))

        if (merchantName == null) {
            val remoteInput =
                RemoteInput
                    .Builder(REMOTE_INPUT_MERCHANT)
                    .setLabel(addMerchant)
                    .build()
            builder.addAction(
                NotificationCompat.Action
                    .Builder(
                        0,
                        addMerchant,
                        actionIntent,
                    ).addRemoteInput(remoteInput)
                    .setAllowGeneratedReplies(false)
                    .build(),
            )
        } else {
            builder.addAction(0, strings.getString(R.string.capture_confirm_and_post), actionIntent)
        }
        val notificationId = captureNotificationId(captureId)
        rememberCaptureNotificationId(context, notificationId)
        manager.notify(notificationId, builder.build())
        manager.notify(
            GROUP_NOTIFICATION_ID,
            NotificationCompat
                .Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(strings.getString(R.string.capture_group_title))
                .setContentText(strings.getString(R.string.capture_group_text))
                .setGroup(CAPTURE_GROUP)
                .setGroupSummary(true)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(publicCaptureNotification(context, strings))
                .setContentIntent(routeIntent(context, "/imports/notifications"))
                .build(),
        )
    }

    fun showCompleted(
        context: Context,
        captureId: String,
    ) {
        if (!canNotify(context)) return
        val strings = NativeLanguage.localized(context)
        ensureChannel(context, strings)
        val notificationId = captureNotificationId(captureId)
        rememberCaptureNotificationId(context, notificationId)
        context.getSystemService(NotificationManager::class.java).notify(
            notificationId,
            NotificationCompat
                .Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(strings.getString(R.string.capture_completed_title))
                .setContentText(strings.getString(R.string.capture_completed_text))
                .setGroup(CAPTURE_GROUP)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(publicCaptureNotification(context, strings))
                .setTimeoutAfter(2_500)
                .build(),
        )
    }

    /**
     * Tells the user a captured payment needed no action from them. [resultCode] is the server's
     * outcome when it reports one; an older server reports only "complete", which covers both a
     * new posting and a link to an existing transaction, so that wording claims no more.
     */
    fun showAutoHandled(
        context: Context,
        platform: String,
        captureId: String,
        amountMinor: Long,
        merchantName: String?,
        resultCode: String? = null,
    ) {
        if (!canNotify(context)) return
        val strings = NativeLanguage.localized(context)
        ensureChannel(context, strings)
        val notificationId = captureNotificationId(captureId)
        rememberCaptureNotificationId(context, notificationId)
        context.getSystemService(NotificationManager::class.java).notify(
            notificationId,
            NotificationCompat
                .Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(autoHandledTitle(strings, resultCode, formatAmount(amountMinor)))
                .setContentText(
                    "${merchantName ?: sourceLabel(strings, platform).trim()} · ${autoHandledDetail(strings, resultCode)}",
                )
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(publicCaptureNotification(context, strings))
                .setContentIntent(routeIntent(context, "/transactions"))
                .setTimeoutAfter(30 * 60_000L)
                .build(),
        )
    }

    fun showNeedsReview(
        context: Context,
        captureId: String,
        @StringRes message: Int = R.string.capture_needs_review_text,
    ) {
        if (!canNotify(context)) return
        val strings = NativeLanguage.localized(context)
        ensureChannel(context, strings)
        val notificationId = captureNotificationId(captureId)
        rememberCaptureNotificationId(context, notificationId)
        context.getSystemService(NotificationManager::class.java).notify(
            notificationId,
            NotificationCompat
                .Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(strings.getString(R.string.capture_needs_review_title))
                .setContentText(strings.getString(message))
                .setGroup(CAPTURE_GROUP)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(publicCaptureNotification(context, strings))
                .setContentIntent(routeIntent(context, "/imports/notifications"))
                .build(),
        )
    }

    fun showAuthenticationRequired(
        context: Context,
        queuedCount: Int,
    ) {
        if (queuedCount <= 0 || !canNotify(context)) return
        val strings = NativeLanguage.localized(context)
        ensureChannel(context, strings)
        context.getSystemService(NotificationManager::class.java).notify(
            AUTH_NOTIFICATION_ID,
            NotificationCompat
                .Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(strings.getString(R.string.capture_auth_title))
                .setContentText(strings.resources.getQuantityString(R.plurals.capture_auth_text, queuedCount, queuedCount))
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(publicCaptureNotification(context, strings))
                .setContentIntent(routeIntent(context, "/settings"))
                .build(),
        )
    }

    /**
     * Fallback entry to the local OCR review when the OS silently blocks a background
     * activity start. Fixed wording only: no amount, merchant or recognised text.
     */
    fun showLocalOcrReady(context: Context, route: String): Boolean {
        if (!canNotify(context)) return false
        return try {
            val strings = NativeLanguage.localized(context)
            ensureChannel(context, strings)
            context.getSystemService(NotificationManager::class.java).notify(
                LOCAL_OCR_NOTIFICATION_ID,
                NotificationCompat
                    .Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(strings.getString(R.string.local_ocr_ready_title))
                    .setContentText(strings.getString(R.string.local_ocr_ready_text))
                    .setContentIntent(routeIntent(context, route))
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                    .setTimeoutAfter(300_000)
                    .build(),
            )
            true
        } catch (_: Exception) {
            false
        }
    }

    /** WeChat's payment code was shown and nothing was captured: ask whether it was used to pay. */
    fun showPaymentCodeReminder(context: Context) {
        if (!canNotify(context)) return
        val strings = NativeLanguage.localized(context)
        ensureChannel(context, strings)
        context.getSystemService(NotificationManager::class.java).notify(
            PAYMENT_CODE_NOTIFICATION_ID,
            NotificationCompat
                .Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(strings.getString(R.string.payment_code_reminder_title))
                .setContentText(strings.getString(R.string.payment_code_reminder_text))
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(publicCaptureNotification(context, strings))
                .setTimeoutAfter(PAYMENT_CODE_REMINDER_TIMEOUT)
                .setContentIntent(routeIntent(context, "/transactions/new"))
                .build(),
        )
    }

    fun clearLocalOcrReady(context: Context) {
        context
            .getSystemService(NotificationManager::class.java)
            .cancel(LOCAL_OCR_NOTIFICATION_ID)
    }

    fun clearCaptureNotifications(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.cancel(GROUP_NOTIFICATION_ID)
        manager.cancel(AUTH_NOTIFICATION_ID)
        manager.cancel(PAYMENT_CODE_NOTIFICATION_ID)
        val preferences =
            context.applicationContext.getSharedPreferences(
                NOTIFICATION_IDS_PREFERENCES,
                Context.MODE_PRIVATE,
            )
        preferences
            .getStringSet(CAPTURE_NOTIFICATION_IDS, emptySet())
            .orEmpty()
            .mapNotNull(String::toIntOrNull)
            .forEach(manager::cancel)
        preferences.edit().remove(CAPTURE_NOTIFICATION_IDS).apply()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            manager.activeNotifications
                .filter {
                    it.notification.group == CAPTURE_GROUP ||
                        it.notification.group == "zemoney_alipay_capture_review"
                }
                .forEach { manager.cancel(it.id) }
        }
    }

    private fun routeIntent(
        context: Context,
        route: String,
    ): PendingIntent {
        val intent =
            Intent(context, MainActivity::class.java)
                .putExtra(ROUTE_EXTRA, route)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(
            context,
            route.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun quickConfirmIntent(
        context: Context,
        captureId: String,
        ownerUserId: String,
    ): PendingIntent {
        val intent =
            Intent(context, QuickConfirmReceiver::class.java)
                .setAction(QuickConfirmReceiver.ACTION_QUICK_CONFIRM)
                .putExtra(QuickConfirmReceiver.EXTRA_CAPTURE_ID, captureId)
                .putExtra(QuickConfirmReceiver.EXTRA_OWNER_USER_ID, ownerUserId)
        return PendingIntent.getBroadcast(
            context,
            captureNotificationId(captureId),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )
    }

    private fun captureNotificationId(captureId: String): Int =
        42000 + (captureId.hashCode() and 0x0fffffff)

    private fun rememberCaptureNotificationId(
        context: Context,
        notificationId: Int,
    ) = synchronized(this) {
        val preferences =
            context.applicationContext.getSharedPreferences(
                NOTIFICATION_IDS_PREFERENCES,
                Context.MODE_PRIVATE,
            )
        val ids =
            preferences
                .getStringSet(CAPTURE_NOTIFICATION_IDS, emptySet())
                .orEmpty()
                .toMutableSet()
        ids += notificationId.toString()
        preferences.edit().putStringSet(CAPTURE_NOTIFICATION_IDS, ids).apply()
    }

    private fun sourceLabel(
        strings: Context,
        platform: String,
    ): String =
        strings.getString(
            when (platform) {
                "alipay" -> R.string.capture_source_alipay
                "wechat" -> R.string.capture_source_wechat
                "taobao" -> R.string.capture_source_taobao
                "pinduoduo" -> R.string.capture_source_pinduoduo
                "jd" -> R.string.capture_source_jd
                "pupu" -> R.string.capture_source_pupu
                "xianyu" -> R.string.capture_source_xianyu
                else -> R.string.capture_source_other
            },
        )

    private fun publicCaptureNotification(
        context: Context,
        strings: Context,
    ): Notification =
        NotificationCompat
            .Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(strings.getString(R.string.capture_public_title))
            .setContentText(strings.getString(R.string.capture_public_text))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

    fun autoHandledTitle(
        strings: Context,
        resultCode: String?,
        amount: String,
    ): String =
        strings.getString(
            when (resultCode) {
                "AUTO_POSTED" -> R.string.capture_auto_posted_title
                "AUTO_SKIPPED_DUPLICATE" -> R.string.capture_auto_duplicate_title
                else -> R.string.capture_auto_handled_title
            },
            amount,
        )

    fun autoHandledDetail(
        strings: Context,
        resultCode: String?,
    ): String =
        strings.getString(
            when (resultCode) {
                "AUTO_POSTED" -> R.string.capture_auto_posted_detail
                "AUTO_SKIPPED_DUPLICATE" -> R.string.capture_auto_duplicate_detail
                else -> R.string.capture_auto_handled_detail
            },
        )

    fun formatAmount(amountMinor: Long): String {
        val absolute = kotlin.math.abs(amountMinor)
        val sign = if (amountMinor < 0) "-" else ""
        return "$sign¥${absolute / 100}.${(absolute % 100).toString().padStart(2, '0')}"
    }

    /**
     * Android shows channel names in system settings exactly as they were given, so after a
     * language switch the channels already created are created again (same IDs, same importance),
     * which only rewords them. The retired listener-health channel is removed, along with any
     * alert an earlier build left in it.
     */
    fun refreshChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        val strings = NativeLanguage.localized(context)
        if (manager.getNotificationChannel(CHANNEL_ID) != null) ensureChannel(context, strings)
        manager.deleteNotificationChannel(RETIRED_HEALTH_CHANNEL_ID)
    }

    private fun ensureChannel(
        context: Context,
        strings: Context,
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel =
            NotificationChannel(
                CHANNEL_ID,
                strings.getString(R.string.capture_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = strings.getString(R.string.capture_channel_description)
            }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun canNotify(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
}
