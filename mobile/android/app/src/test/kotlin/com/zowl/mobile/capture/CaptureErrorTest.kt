package com.zowl.mobile.capture

import com.zowl.mobile.R
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CaptureErrorTest {
    // Stand-ins for the two resource sets, so rendering can be checked without Android.
    private val english =
        mapOf(
            R.string.capture_error_session_expired to "Sign-in expired",
            R.string.capture_error_some_rejected to "The server rejected some candidates (%1\$s)",
            R.string.capture_error_protocol to "The server’s protocol or version isn’t compatible (HTTP %1\$d)",
        )
    private val chinese =
        mapOf(
            R.string.capture_error_session_expired to "登录已过期",
            R.string.capture_error_some_rejected to "部分候选被服务器拒绝（%1\$s）",
            R.string.capture_error_protocol to "服务器协议或版本不兼容（HTTP %1\$d）",
        )

    private fun render(
        stored: String?,
        strings: Map<Int, String>,
    ) = CaptureError.render(stored) { text, args -> strings.getValue(text).format(*args) }

    @Test
    fun anErrorWrittenBeforeALanguageSwitchIsWordedInTheNewLanguage() {
        val stored = CaptureError.SESSION_EXPIRED.store()

        assertEquals("登录已过期", render(stored, chinese))
        assertEquals("Sign-in expired", render(stored, english))
    }

    @Test
    fun formatArgumentsSurviveStorage() {
        val rejected = CaptureError.SOME_REJECTED.store("DUPLICATE, 100%|INVALID")
        val protocol = CaptureError.PROTOCOL.store(426)

        assertEquals("The server rejected some candidates (DUPLICATE, 100%|INVALID)", render(rejected, english))
        assertEquals("部分候选被服务器拒绝（DUPLICATE, 100%|INVALID）", render(rejected, chinese))
        assertEquals("The server’s protocol or version isn’t compatible (HTTP 426)", render(protocol, english))
        assertEquals("服务器协议或版本不兼容（HTTP 426）", render(protocol, chinese))
    }

    @Test
    fun storesTheResourceNameNotFinishedText() {
        assertEquals("capture-error:capture_error_protocol|d426", CaptureError.PROTOCOL.store(426))
        assertEquals("capture-error:capture_error_session_expired", CaptureError.SESSION_EXPIRED.store())
    }

    @Test
    fun plainTextFromOlderVersionsIsShownAsItIs() {
        assertEquals("Session expired", render("Session expired", chinese))
        assertEquals("同步暂时失败", render("同步暂时失败", english))
        assertNull(render(null, english))
    }

    @Test
    fun anUnknownOrDamagedStoredErrorIsDropped() {
        assertNull(render("capture-error:capture_error_from_a_newer_build", english))
        assertNull(render("capture-error:capture_error_protocol|x426", english))
        assertNull(render("capture-error:capture_error_protocol|dabc", english))
    }
}
