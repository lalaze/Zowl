package com.zowl.mobile.ocr

/** Closed vocabulary only: this API cannot accept exception text, packages, IDs or OCR content. */
object LocalOcrDiagnosticsSchema {
    enum class Stage { TILE_ADD, TILE_CLICK, ELIGIBILITY, PREPARE, COLLAPSE, STABLE_TARGET, SCREENSHOT, OCR, REVIEW, REQUEST }
    enum class Reason {
        RECEIVED, READY, UNSUPPORTED_API, LOCKED, DISABLED, SERVICE_MISSING, OWNER_MISSING, BUSY,
        WINDOWS_UNAVAILABLE, NO_APP_WINDOW, MULTIPLE_APP_WINDOWS, PACKAGE_EMPTY, PACKAGE_UNSUPPORTED,
        DISPLAY_UNSUPPORTED, REQUEST_UNAVAILABLE, SETTINGS_REQUESTED, REQUESTED, ACTIVITY_ENTERED,
        PENDING_INVALID, LAUNCH_ERROR, TARGET_CHANGED, NOT_ACTIVE, NOT_FOCUSED, EMPTY_BOUNDS,
        BLOCKED_WINDOW, WAITING, TIMEOUT, API_SUCCESS, API_ERROR, API_EXCEPTION, WINDOW_CHANGED,
        BITMAP_ERROR, BITMAP_UNAVAILABLE, MODEL_ERROR, STARTED, SUCCESS, EMPTY_TEXT, UNSUPPORTED_PAGE,
        TOO_MUCH_TEXT, MULTIPLE_AMOUNTS, MISSING_AMOUNT, REJECTED, TASK_ERROR, DRAFT_READY,
        DISCONNECTED, ADDED, ALREADY_ADDED, NOT_ADDED, UNAVAILABLE,
        GLOBAL_ACTION, GLOBAL_ACTION_FAILED, FALLBACK_REQUESTED, OPEN_REQUESTED, OPEN_ERROR, NOTIFIED,
        NO_SUCCESS_MARKER, EXCLUDED_CONTENT,
    }
    enum class Metric {
        API_SUPPORTED, UNLOCKED, ENABLED, SERVICE_PRESENT, OWNER_PRESENT, BUSY,
        WINDOW_COUNT, APP_WINDOW_COUNT, APP_ROOT_MISSING_COUNT, APP_PACKAGE_EMPTY_COUNT,
        ALLOWED_APP_COUNT, SYSTEM_APP_COUNT, OTHER_APP_COUNT,
        SINGLE_APP_PACKAGE_EMPTY, TARGET_PRESENT, TARGET_ACTIVE, TARGET_FOCUSED,
        TARGET_DEFAULT_DISPLAY, TARGET_ID_MATCH, TARGET_PACKAGE_MATCH,
        WINDOW_EPOCH_CHANGED, ERROR_CODE, LINE_COUNT, AMOUNT_COUNT,
    }
    private const val MAX = 1_000_000
    private fun key(value: Enum<*>) = value.name.lowercase(java.util.Locale.ROOT)
    private val stages = Stage.entries.map(::key).toSet()
    private val reasons = Reason.entries.map(::key).toSet()
    private val countKeys = Stage.entries.flatMap { stage -> Reason.entries.map { reason ->
        "count_${key(stage)}_${key(reason)}"
    } }.toSet() + "tile_listening_count"
    private val metricKeys = Stage.entries.flatMap { stage -> Metric.entries.map { metric ->
        "${key(stage)}_${key(metric)}"
    } }.toSet()
    private val reasonKeys = stages.map { "${it}_reason" }.toSet() + "last_reason"

    fun sanitize(values: Map<String, *>): Map<String, Any> = values.filter { (name, value) ->
        when (name) {
            "schema_version" -> value == 1
            "last_stage" -> value is String && value in stages
            in reasonKeys -> value is String && value in reasons
            in countKeys -> value is Int && value in 0..MAX
            in metricKeys -> value is Int && value in -1..MAX
            else -> false
        }
    }.mapValues { it.value!! }

    fun record(previous: Map<String, *>, stage: Stage, reason: Reason,
        metrics: Map<Metric, Int> = emptyMap()): Map<String, Any> {
        val next = sanitize(previous).toMutableMap()
        val countKey = "count_${key(stage)}_${key(reason)}"
        next["schema_version"] = 1
        next["last_stage"] = key(stage)
        next["last_reason"] = key(reason)
        next["${key(stage)}_reason"] = key(reason)
        next[countKey] = ((next[countKey] as? Int ?: 0) + 1).coerceAtMost(MAX)
        metrics.forEach { (metric, value) -> next["${key(stage)}_${key(metric)}"] = value.coerceIn(-1, MAX) }
        return next
    }

    fun listening(previous: Map<String, *>): Map<String, Any> = sanitize(previous).toMutableMap().apply {
        put("schema_version", 1)
        put("tile_listening_count", ((get("tile_listening_count") as? Int ?: 0) + 1).coerceAtMost(MAX))
    }
}
