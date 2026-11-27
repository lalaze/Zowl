package com.zowl.mobile.capture

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.zowl.mobile.NativeLanguage
import com.zowl.mobile.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

class QuickConfirmWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result =
        withContext(Dispatchers.IO) {
            val queue = EncryptedQuickConfirmQueue(applicationContext)
            val preferences = CapturePreferences(applicationContext)
            val session = preferences.session()
            if (session == null || preferences.authPaused) {
                CaptureNotificationPublisher.showAuthenticationRequired(
                    applicationContext,
                    queue.count(),
                )
                return@withContext Result.success()
            }
            val actions = queue.snapshot(session.userId)
            if (actions.isEmpty()) return@withContext Result.success()

            var shouldRetry = false
            for (action in actions) {
                if (action.ownerUserId != session.userId) continue
                when (submit(session, action)) {
                    QuickConfirmDisposition.COMPLETED -> {
                        queue.remove(session.userId, setOf(action.captureId))
                        if (
                            preferences.markSyncSucceeded(session.userId) &&
                            preferences.enabled
                        ) {
                            CaptureNotificationPublisher.showCompleted(
                                applicationContext,
                                action.captureId,
                            )
                        }
                    }
                    QuickConfirmDisposition.NEEDS_REVIEW -> {
                        queue.remove(session.userId, setOf(action.captureId))
                        if (isCurrentAndEnabled(preferences, session.userId)) {
                            CaptureNotificationPublisher.showNeedsReview(
                                applicationContext,
                                action.captureId,
                            )
                        }
                    }
                    QuickConfirmDisposition.UNAUTHORIZED -> {
                        if (preferences.pauseSessionIfOwnedBy(session.userId)) {
                            CaptureNotificationPublisher.showAuthenticationRequired(
                                applicationContext,
                                queue.count(session.userId),
                            )
                        }
                        return@withContext Result.success()
                    }
                    QuickConfirmDisposition.TERMINAL_REJECTION -> {
                        queue.remove(session.userId, setOf(action.captureId))
                        preferences.setLastErrorIfOwnedBy(session.userId, CaptureError.QUICK_CONFIRM_REJECTED)
                        if (isCurrentAndEnabled(preferences, session.userId)) {
                            CaptureNotificationPublisher.showNeedsReview(
                                applicationContext,
                                action.captureId,
                                R.string.capture_quick_entry_rejected_text,
                            )
                        }
                    }
                    QuickConfirmDisposition.RETRY -> {
                        preferences.setLastErrorIfOwnedBy(session.userId, CaptureError.QUICK_CONFIRM_RETRY)
                        shouldRetry = true
                    }
                }
            }
            if (shouldRetry || queue.count(session.userId) > 0) {
                Result.retry()
            } else {
                Result.success()
            }
        }

    private fun isCurrentAndEnabled(
        preferences: CapturePreferences,
        ownerUserId: String,
    ): Boolean = preferences.enabled && preferences.session()?.userId == ownerUserId

    private fun submit(
        session: CaptureSession,
        action: QuickConfirmAction,
    ): QuickConfirmDisposition {
        val connection =
            runCatching {
                URL(
                    "${session.apiBaseUrl}/api/captures/notifications/" +
                        "${action.captureId}/quick-confirm",
                ).openConnection() as HttpURLConnection
            }.getOrElse { return QuickConfirmDisposition.RETRY }
        return try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 15_000
            connection.readTimeout = 45_000
            connection.doOutput = true
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.setRequestProperty("Authorization", "Bearer ${session.token}")
            // The server writes the posted transaction's text and its errors in this language.
            connection.setRequestProperty("Accept-Language", NativeLanguage.acceptLanguage(applicationContext))
            val payload =
                JSONObject()
                    .apply {
                        if (action.merchantName != null) {
                            put("merchantName", action.merchantName)
                        }
                    }.toString()
                    .toByteArray(Charsets.UTF_8)
            connection.setFixedLengthStreamingMode(payload.size)
            connection.outputStream.use { it.write(payload) }
            QuickConfirmHttpPolicy.classify(connection.responseCode)
        } catch (_: Exception) {
            QuickConfirmDisposition.RETRY
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        // Kept from the zeMoney name so pending WorkManager quick-confirm jobs are not duplicated across upgrades.
        private const val UNIQUE_WORK = "zemoney-payment-quick-confirm"

        fun enqueue(context: Context) {
            val constraints =
                Constraints
                    .Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            val request =
                OneTimeWorkRequestBuilder<QuickConfirmWorker>()
                    .setConstraints(constraints)
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                    .build()
            WorkManager
                .getInstance(context.applicationContext)
                .enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.KEEP, request)
        }

        fun cancel(context: Context) {
            WorkManager
                .getInstance(context.applicationContext)
                .cancelUniqueWork(UNIQUE_WORK)
        }
    }
}
