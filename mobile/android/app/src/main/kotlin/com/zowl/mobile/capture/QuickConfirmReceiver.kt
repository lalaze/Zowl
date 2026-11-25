package com.zowl.mobile.capture

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput

class QuickConfirmReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        if (intent.action != ACTION_QUICK_CONFIRM) return
        val captureId = intent.getStringExtra(EXTRA_CAPTURE_ID) ?: return
        val ownerUserId = intent.getStringExtra(EXTRA_OWNER_USER_ID) ?: return
        val remoteInput = RemoteInput.getResultsFromIntent(intent)
        val merchantName =
            remoteInput
                ?.getCharSequence(CaptureNotificationPublisher.REMOTE_INPUT_MERCHANT)
                ?.toString()

        val action =
            runCatching {
                QuickConfirmAction.create(
                    captureId = captureId,
                    ownerUserId = ownerUserId,
                    merchantName = merchantName,
                )
            }.getOrNull() ?: return
        val preferences = CapturePreferences(context)
        if (preferences.session()?.userId != action.ownerUserId) {
            CaptureNotificationPublisher.showAuthenticationRequired(context, 1)
            return
        }
        EncryptedQuickConfirmQueue(context).enqueue(action)
        QuickConfirmWorker.enqueue(context)
    }

    companion object {
        const val ACTION_QUICK_CONFIRM = "com.zowl.mobile.action.QUICK_CONFIRM"
        const val EXTRA_CAPTURE_ID = "capture_id"
        const val EXTRA_OWNER_USER_ID = "owner_user_id"
    }
}
