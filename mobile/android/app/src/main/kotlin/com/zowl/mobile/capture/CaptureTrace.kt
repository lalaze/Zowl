package com.zowl.mobile.capture

import android.util.Log

/**
 * Tracing of the capture pipeline. Every message goes to the on-device [CaptureLog]; logcat gets
 * it too once switched on over adb: `adb shell setprop log.tag.ZowlCapture DEBUG`. Messages
 * describe structure only (window class names, counts, outcomes, reason codes); never page text,
 * amounts, merchants or anything read from a screen.
 */
object CaptureTrace {
    private const val TAG = "ZowlCapture"

    fun d(message: () -> String) {
        val text = message()
        CaptureLog.write(text)
        if (Log.isLoggable(TAG, Log.DEBUG)) Log.d(TAG, text)
    }
}
