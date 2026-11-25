package com.zowl.mobile.capture

import org.junit.Assert.*
import org.junit.Test

class CaptureDiagnosticsWindowsTest {
    private fun window(label: String, count: Long = 0) = CaptureDiagnosticCounter("wechat",
        "wechat_payment_page_ocr_v1", 1, CaptureDiagnosticsStore.OUTCOME_OBSERVED,
        "${CaptureDiagnosticsStore.REASON_OCR_WINDOW_SKIPPED}$label", count)

    @Test fun aNewlySeenWindowIsKeptWhenTheListIsFull() {
        val full = (1..16).map { window("Frequent$it", count = 50) }
        val other = CaptureDiagnosticCounter("wechat", "wechat_payment_page_ocr_v1", 1,
            CaptureDiagnosticsStore.OUTCOME_ACCEPTED, null, 3)
        val result = CaptureDiagnosticsStore.withOcrWindow(full + other, window("WxaLiteAppTransparentLiteUI"))
        val windows = result.filter { it.reason?.startsWith(CaptureDiagnosticsStore.REASON_OCR_WINDOW_PREFIX) == true }
        assertEquals(16, windows.size)
        assertEquals(1L, windows.last().count)
        assertTrue(windows.last().reason!!.endsWith("WxaLiteAppTransparentLiteUI"))
        // The window seen longest ago made room; counters that are not windows are untouched.
        assertTrue(windows.none { it.reason!!.endsWith("Frequent1") })
        assertTrue(result.contains(other))
    }

    @Test fun aWindowSeenAgainIsCountedAndBecomesTheMostRecent() {
        val start = listOf(window("A", 2), window("B", 1))
        val result = CaptureDiagnosticsStore.withOcrWindow(start, window("A"))
        assertEquals(listOf("B" to 1L, "A" to 3L), result.map { it.reason!!.substringAfter(':') to it.count })
    }
}
