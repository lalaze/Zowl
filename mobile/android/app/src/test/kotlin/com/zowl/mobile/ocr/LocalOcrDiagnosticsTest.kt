package com.zowl.mobile.ocr

import org.junit.Assert.*
import org.junit.Test
import com.zowl.mobile.ocr.LocalOcrDiagnosticsSchema.Stage
import com.zowl.mobile.ocr.LocalOcrDiagnosticsSchema.Reason
import com.zowl.mobile.ocr.LocalOcrDiagnosticsSchema.Metric

class LocalOcrDiagnosticsTest {
    @Test fun arbitraryStringsAndUnknownKeysCannotEnterTheSnapshot() {
        val snapshot = LocalOcrDiagnosticsSchema.sanitize(mapOf(
            "last_stage" to "private page title", "last_reason" to "raw exception",
            "owner" to "user-secret", "token" to "token-secret", "amount" to 1280,
            "prepare_window_count" to "com.tencent.mm", "screenshot_error_code" to 6,
        ))
        assertEquals(mapOf("screenshot_error_code" to 6), snapshot)
    }

    @Test fun stagesKeepSeparateCountersAndOnlyFixedReasons() {
        var snapshot = LocalOcrDiagnosticsSchema.record(emptyMap<String, Any>(), Stage.TILE_CLICK, Reason.RECEIVED)
        snapshot = LocalOcrDiagnosticsSchema.record(snapshot, Stage.PREPARE, Reason.PACKAGE_EMPTY,
            mapOf(Metric.APP_WINDOW_COUNT to 1, Metric.APP_PACKAGE_EMPTY_COUNT to 1))
        snapshot = LocalOcrDiagnosticsSchema.record(snapshot, Stage.SCREENSHOT, Reason.API_ERROR, mapOf(Metric.ERROR_CODE to 6))
        assertEquals(1, snapshot["count_tile_click_received"])
        assertEquals("package_empty", snapshot["prepare_reason"])
        assertEquals(1, snapshot["prepare_app_package_empty_count"])
        assertEquals(6, snapshot["screenshot_error_code"])
        assertEquals("screenshot", snapshot["last_stage"])
        assertEquals("api_error", snapshot["last_reason"])
    }

    @Test fun countersSaturateAndTileListeningDoesNotEraseLastOutcome() {
        val snapshot = LocalOcrDiagnosticsSchema.record(mapOf("count_tile_click_received" to 1_000_000), Stage.TILE_CLICK, Reason.RECEIVED)
        val listening = LocalOcrDiagnosticsSchema.listening(snapshot)
        assertEquals(1_000_000, listening["count_tile_click_received"])
        assertEquals(1, listening["tile_listening_count"])
        assertEquals("tile_click", listening["last_stage"])
    }
}
