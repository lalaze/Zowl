package com.zowl.mobile.capture

import android.content.Context
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant

data class CaptureQueueSnapshot(
    val ownerUserId: String,
    val events: List<CapturedPayment>,
)

class EncryptedCaptureQueue(context: Context) {
    private val file = File(context.applicationContext.noBackupFilesDir, "payment-capture-queue.enc")
    private val atomicFile = AtomicFile(file)

    fun enqueue(
        event: CapturedPayment,
        ownerUserId: String,
    ): Boolean =
        synchronized(lock) {
            if (ownerUserId.isBlank()) return@synchronized false
            val current = readEnvelope()
            val items =
                if (current?.ownerUserId == ownerUserId) {
                    current.events.toMutableList()
                } else {
                    mutableListOf()
                }
            if (items.any { it.idempotencyKey == event.idempotencyKey }) return@synchronized false
            items.removeAll { isExpired(it) }
            items += event
            while (items.size > MAX_ITEMS) items.removeAt(0)
            write(CaptureQueueSnapshot(ownerUserId, items))
            true
        }

    fun snapshot(limit: Int = 20): CaptureQueueSnapshot? =
        synchronized(lock) {
            val current = readEnvelope() ?: return@synchronized null
            val valid = current.events.filterNot(::isExpired)
            if (valid.size != current.events.size) {
                write(CaptureQueueSnapshot(current.ownerUserId, valid))
            }
            valid
                .take(limit.coerceIn(1, 20))
                .takeIf { it.isNotEmpty() }
                ?.let { CaptureQueueSnapshot(current.ownerUserId, it) }
        }

    fun peek(limit: Int = 20): List<CapturedPayment> =
        snapshot(limit)?.events ?: emptyList()

    fun remove(
        ownerUserId: String,
        idempotencyKeys: Set<String>,
    ) = synchronized(lock) {
        if (idempotencyKeys.isEmpty()) return@synchronized
        val current = readEnvelope() ?: return@synchronized
        if (current.ownerUserId != ownerUserId) return@synchronized
        write(
            CaptureQueueSnapshot(
                ownerUserId,
                current.events.filterNot { it.idempotencyKey in idempotencyKeys },
            ),
        )
    }

    fun clearIfOwnedBy(ownerUserId: String) =
        synchronized(lock) {
            if (readEnvelope()?.ownerUserId == ownerUserId) atomicFile.delete()
        }

    fun count(): Int =
        synchronized(lock) {
            val current = readEnvelope() ?: return@synchronized 0
            val valid = current.events.filterNot(::isExpired)
            if (valid.size != current.events.size) {
                write(CaptureQueueSnapshot(current.ownerUserId, valid))
            }
            valid.size
        }

    fun clear() =
        synchronized(lock) {
            atomicFile.delete()
        }

    private fun readEnvelope(): CaptureQueueSnapshot? {
        if (!file.exists()) return null
        return runCatching {
            val decrypted =
                AndroidKeystoreCipher
                    .decrypt(
                        atomicFile
                            .openRead()
                            .bufferedReader(Charsets.UTF_8)
                            .use { it.readText() },
                    )
                    .toString(Charsets.UTF_8)
            val json = JSONObject(decrypted)
            if (json.getInt("version") != QUEUE_VERSION) error("Unsupported queue version")
            val ownerUserId = json.getString("ownerUserId")
            if (ownerUserId.isBlank()) error("Missing queue owner")
            val events = json.getJSONArray("events")
            CaptureQueueSnapshot(
                ownerUserId,
                List(events.length()) { index -> fromJson(events.getJSONObject(index)) },
            )
        }.getOrElse {
            // Legacy ownerless arrays and malformed payloads are untrusted.
            atomicFile.delete()
            null
        }
    }

    private fun write(snapshot: CaptureQueueSnapshot) {
        if (snapshot.events.isEmpty()) {
            atomicFile.delete()
            return
        }
        val events = JSONArray()
        snapshot.events.forEach { events.put(toJson(it)) }
        val envelope =
            JSONObject()
                .put("version", QUEUE_VERSION)
                .put("ownerUserId", snapshot.ownerUserId)
                .put("events", events)
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

    private fun isExpired(event: CapturedPayment): Boolean =
        runCatching {
            Instant.parse(event.postedAt).toEpochMilli() < System.currentTimeMillis() - RETENTION_MILLIS
        }.getOrDefault(true)

    companion object {
        private val lock = CaptureAccountLock.monitor
        private const val QUEUE_VERSION = 2
        private const val MAX_ITEMS = 100
        private const val RETENTION_MILLIS = 7L * 24 * 60 * 60 * 1000

        fun toApiJson(event: CapturedPayment): JSONObject =
            eventJson(event).apply {
                // Left out entirely when absent: servers before ADR-0014 ignore the key either way.
                event.orderContext?.let { context ->
                    put(
                        "orderContext",
                        JSONObject().put(
                            "pages",
                            JSONArray(
                                context.pages.map { page ->
                                    JSONObject().put("source", page.source).put("lines", JSONArray(page.lines))
                                },
                            ),
                        ),
                    )
                }
            }

        private fun eventJson(event: CapturedPayment): JSONObject =
            JSONObject()
                .put("idempotencyKey", event.idempotencyKey)
                .put("platform", event.platform)
                .put("sourcePackage", event.sourcePackage)
                .put("postedAt", event.postedAt)
                .put("parserId", event.parserId)
                .put("parserVersion", event.parserVersion)
                .put("evidenceDigest", event.evidenceDigest)
                .put("confidenceBasisPoints", event.confidenceBasisPoints)
                .put(
                    "facts",
                    JSONObject()
                        .put("amountMinor", event.amountMinor)
                        .put("merchantName", event.merchantName ?: JSONObject.NULL),
                )

        private fun toJson(event: CapturedPayment): JSONObject = toApiJson(event)

        private fun fromJson(json: JSONObject): CapturedPayment =
            CapturedPayment(
                idempotencyKey = json.getString("idempotencyKey"),
                platform = json.getString("platform"),
                sourcePackage = json.getString("sourcePackage"),
                postedAt = json.getString("postedAt"),
                parserId = json.getString("parserId"),
                parserVersion = json.getInt("parserVersion"),
                evidenceDigest = json.getString("evidenceDigest"),
                confidenceBasisPoints = json.getInt("confidenceBasisPoints"),
                amountMinor = json.getJSONObject("facts").getLong("amountMinor"),
                merchantName =
                    json
                        .getJSONObject("facts")
                        .optString("merchantName")
                        .takeIf { it.isNotBlank() && it != "null" },
                // Absent in records queued by earlier builds.
                orderContext = json.optJSONObject("orderContext")?.optJSONArray("pages")?.let { pages ->
                    (0 until pages.length()).mapNotNull { index ->
                        val page = pages.optJSONObject(index) ?: return@mapNotNull null
                        val lines = page.optJSONArray("lines") ?: return@mapNotNull null
                        OrderContextPage(
                            page.optString("source"),
                            (0 until lines.length()).map(lines::getString),
                        )
                    }.takeIf { it.isNotEmpty() }?.let(::OrderContext)
                },
            )
    }
}
