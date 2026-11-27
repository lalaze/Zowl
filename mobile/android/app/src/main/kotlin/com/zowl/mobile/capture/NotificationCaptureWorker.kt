package com.zowl.mobile.capture

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.zowl.mobile.NativeLanguage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

class NotificationCaptureWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result =
        withContext(Dispatchers.IO) {
            val queue = EncryptedCaptureQueue(applicationContext)
            val pending = queue.snapshot(BATCH_SIZE) ?: return@withContext Result.success()
            val preferences = CapturePreferences(applicationContext)
            val session = preferences.session()
            if (session == null || preferences.authPaused) {
                CaptureTrace.d { "upload waiting: signed out events=${pending.events.size}" }
                CaptureNotificationPublisher.showAuthenticationRequired(
                    applicationContext,
                    queue.count(),
                )
                return@withContext Result.success()
            }
            if (session.userId != pending.ownerUserId) {
                queue.clearIfOwnedBy(pending.ownerUserId)
                return@withContext Result.success()
            }

            // Keep this immutable snapshot for the entire request. If an account
            // switch happens now, this worker can only upload with the old token.
            val ownerUserId = pending.ownerUserId
            val connection =
                runCatching {
                    URL("${session.apiBaseUrl}/api/captures/notifications").openConnection()
                        as HttpURLConnection
                }.getOrElse {
                    CaptureTrace.d { "upload cannot connect" }
                    preferences.setLastErrorIfOwnedBy(ownerUserId, CaptureError.CANNOT_CONNECT)
                    return@withContext Result.retry()
                }
            try {
                connection.requestMethod = "POST"
                connection.connectTimeout = 15_000
                // The server may read the order with a model before it answers.
                connection.readTimeout = 95_000
                connection.doOutput = true
                connection.setRequestProperty("Accept", "application/json")
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.setRequestProperty("Authorization", "Bearer ${session.token}")
                // The server writes captured transactions' text and its errors in this language.
                connection.setRequestProperty("Accept-Language", NativeLanguage.acceptLanguage(applicationContext))
                val events = JSONArray()
                pending.events.forEach { events.put(EncryptedCaptureQueue.toApiJson(it)) }
                val body = JSONObject().put("events", events).toString().toByteArray(Charsets.UTF_8)
                connection.setFixedLengthStreamingMode(body.size)
                connection.outputStream.use { it.write(body) }

                val status = connection.responseCode
                CaptureTrace.d { "upload events=${pending.events.size} http=$status" }
                when (CaptureUploadHttpPolicy.classify(status)) {
                    CaptureUploadDisposition.ACCEPT_RESPONSE -> {
                        val response = connection.inputStream.bufferedReader().use { it.readText() }
                        val payload = JSONObject(response).getJSONObject("data")
                        val items = payload.getJSONArray("items")
                        val removable = mutableSetOf<String>()
                        val eventByKey = pending.events.associateBy { it.idempotencyKey }
                        val stillCurrent = preferences.markSyncSucceeded(ownerUserId)
                        val rejectedCodes = mutableSetOf<String>()
                        for (index in 0 until items.length()) {
                            val item = items.getJSONObject(index)
                            val key = item.optString("idempotencyKey")
                            val itemStatus = item.optString("status")
                            if (
                                key.isNotBlank() &&
                                itemStatus in
                                setOf("accepted", "already_accepted", "rejected")
                            ) {
                                removable += key
                            }
                            if (itemStatus == "rejected") {
                                item.optString("code").takeIf(String::isNotBlank)?.let {
                                    rejectedCodes += it
                                }
                            }
                            // Newly accepted and already complete: posted (or linked) without the user.
                            if (itemStatus == "accepted" && item.optString("reviewStatus") == "completed") {
                                val event = eventByKey[key]
                                val captureId = item.optString("captureId")
                                if (stillCurrent && event != null && captureId.isNotBlank()) {
                                    CaptureNotificationPublisher.showAutoHandled(
                                        applicationContext,
                                        platform = event.platform,
                                        captureId = captureId,
                                        amountMinor = event.amountMinor,
                                        merchantName = event.merchantName,
                                        resultCode = item.optString("resultCode").takeIf { it.isNotBlank() && it != "null" },
                                    )
                                }
                            }
                            if (
                                item.optString("reviewStatus") == "reviewing" &&
                                itemStatus != "rejected"
                            ) {
                                val event = eventByKey[key]
                                val captureId = item.optString("captureId")
                                if (stillCurrent && event != null && captureId.isNotBlank()) {
                                    CaptureNotificationPublisher.showCaptureReview(
                                        applicationContext,
                                        platform = event.platform,
                                        captureId = captureId,
                                        amountMinor = event.amountMinor,
                                        merchantName = event.merchantName,
                                        ownerUserId = ownerUserId,
                                    )
                                }
                            }
                        }
                        CaptureTrace.d {
                            // Statuses and codes only: which events the server took and what became of them.
                            val outcomes = (0 until items.length()).map { index ->
                                val item = items.getJSONObject(index)
                                val platform = eventByKey[item.optString("idempotencyKey")]?.platform ?: "?"
                                listOf(platform, item.optString("status"), item.optString("reviewStatus"),
                                    item.optString("code"), item.optString("resultCode"))
                                    .filter { it.isNotBlank() && it != "null" }.joinToString("/")
                            }
                            "upload results $outcomes"
                        }
                        queue.remove(ownerUserId, removable)
                        if (!stillCurrent) return@withContext Result.success()
                        if (rejectedCodes.isNotEmpty()) {
                            preferences.setLastErrorIfOwnedBy(
                                ownerUserId,
                                CaptureError.SOME_REJECTED,
                                rejectedCodes.sorted().joinToString(),
                            )
                        }
                        // Re-run this same work request to drain the next batch.
                        // Enqueuing KEEP work while this worker is RUNNING would
                        // be ignored by WorkManager and could strand item 21+.
                        if (queue.count() > 0) Result.retry() else Result.success()
                    }
                    CaptureUploadDisposition.UNAUTHORIZED -> {
                        val stillCurrent = preferences.pauseSessionIfOwnedBy(ownerUserId)
                        if (stillCurrent) {
                            CaptureNotificationPublisher.showAuthenticationRequired(
                                applicationContext,
                                queue.count(),
                            )
                        }
                        Result.success()
                    }
                    CaptureUploadDisposition.PROTOCOL_ERROR -> {
                        preferences.setLastErrorIfOwnedBy(ownerUserId, CaptureError.PROTOCOL, status)
                        Result.success()
                    }
                    CaptureUploadDisposition.RETRY -> {
                        preferences.setLastErrorIfOwnedBy(ownerUserId, CaptureError.SYNC_FAILED)
                        Result.retry()
                    }
                }
            } catch (error: Exception) {
                CaptureTrace.d { "upload failed ${error.javaClass.simpleName}" }
                preferences.setLastErrorIfOwnedBy(ownerUserId, CaptureError.NETWORK)
                Result.retry()
            } finally {
                connection.disconnect()
            }
        }

    companion object {
        // Kept from the zeMoney name so pending WorkManager upload jobs are not duplicated across upgrades.
        private const val UNIQUE_WORK = "zemoney-payment-capture-upload"
        private const val BATCH_SIZE = 20

        fun enqueue(context: Context) {
            val constraints =
                Constraints
                    .Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            val request =
                OneTimeWorkRequestBuilder<NotificationCaptureWorker>()
                    .setConstraints(constraints)
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                    .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
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
