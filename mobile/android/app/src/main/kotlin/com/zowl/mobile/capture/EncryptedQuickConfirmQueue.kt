package com.zowl.mobile.capture

import android.content.Context
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class EncryptedQuickConfirmQueue(context: Context) {
    private val file =
        File(context.applicationContext.noBackupFilesDir, "payment-quick-confirm-queue.enc")
    private val atomicFile = AtomicFile(file)

    fun enqueue(action: QuickConfirmAction) =
        synchronized(lock) {
            val items = read().filterNot(::isExpired).toMutableList()
            items.removeAll {
                it.captureId == action.captureId && it.ownerUserId == action.ownerUserId
            }
            items += action
            while (items.size > MAX_ITEMS) items.removeAt(0)
            write(items)
        }

    fun snapshot(
        ownerUserId: String,
        limit: Int = 20,
    ): List<QuickConfirmAction> =
        synchronized(lock) {
            val valid = read().filterNot(::isExpired)
            write(valid)
            valid
                .asSequence()
                .filter { it.ownerUserId == ownerUserId }
                .take(limit.coerceIn(1, 20))
                .toList()
        }

    fun remove(
        ownerUserId: String,
        captureIds: Set<String>,
    ) = synchronized(lock) {
        if (captureIds.isEmpty()) return@synchronized
        write(
            read().filterNot {
                it.ownerUserId == ownerUserId && it.captureId in captureIds
            },
        )
    }

    fun count(ownerUserId: String? = null): Int =
        synchronized(lock) {
            val valid = read().filterNot(::isExpired)
            write(valid)
            if (ownerUserId == null) valid.size else valid.count { it.ownerUserId == ownerUserId }
        }

    fun clear() =
        synchronized(lock) {
            atomicFile.delete()
        }

    private fun read(): List<QuickConfirmAction> {
        if (!file.exists()) return emptyList()
        return runCatching {
            val decrypted =
                AndroidKeystoreCipher
                    .decrypt(
                        atomicFile.openRead().bufferedReader(Charsets.UTF_8).use { it.readText() },
                    ).toString(Charsets.UTF_8)
            val envelope = JSONObject(decrypted)
            if (envelope.getInt("version") != QUEUE_VERSION) error("Unsupported queue version")
            val actions = envelope.getJSONArray("actions")
            List(actions.length()) { index ->
                val action = actions.getJSONObject(index)
                QuickConfirmAction.create(
                    captureId = action.getString("captureId"),
                    ownerUserId = action.getString("ownerUserId"),
                    merchantName =
                        action
                            .optString("merchantName")
                            .takeIf { it.isNotBlank() && it != "null" },
                    createdAtEpochMillis = action.getLong("createdAtEpochMillis"),
                )
            }
        }.getOrElse {
            atomicFile.delete()
            emptyList()
        }
    }

    private fun write(actions: List<QuickConfirmAction>) {
        if (actions.isEmpty()) {
            atomicFile.delete()
            return
        }
        val values = JSONArray()
        actions.forEach { action ->
            values.put(
                JSONObject()
                    .put("captureId", action.captureId)
                    .put("ownerUserId", action.ownerUserId)
                    .put("merchantName", action.merchantName ?: JSONObject.NULL)
                    .put("createdAtEpochMillis", action.createdAtEpochMillis),
            )
        }
        val envelope = JSONObject().put("version", QUEUE_VERSION).put("actions", values)
        val encrypted =
            AndroidKeystoreCipher.encrypt(envelope.toString().toByteArray(Charsets.UTF_8))
        val output = atomicFile.startWrite()
        try {
            output.write(encrypted.toByteArray(Charsets.UTF_8))
            atomicFile.finishWrite(output)
        } catch (error: Exception) {
            atomicFile.failWrite(output)
            throw error
        }
    }

    private fun isExpired(action: QuickConfirmAction): Boolean =
        action.createdAtEpochMillis < System.currentTimeMillis() - RETENTION_MILLIS

    companion object {
        private val lock = CaptureAccountLock.monitor
        private const val QUEUE_VERSION = 1
        private const val MAX_ITEMS = 100
        private const val RETENTION_MILLIS = 7L * 24 * 60 * 60 * 1000
    }
}
