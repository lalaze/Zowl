package com.zowl.mobile

import android.app.Application
import com.zowl.mobile.capture.CaptureLog

class ZowlApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Every start of the process, whichever component it is for, and why the last one ended.
        CaptureLog.init(this)
        CaptureLog.onProcessStart()
        // The Zowl Scan tile is gone (ADR-0009): drop its on/off switch and its diagnostics.
        RETIRED_PREFERENCES.forEach(::deleteSharedPreferences)
    }

    private companion object {
        val RETIRED_PREFERENCES = listOf("local_ocr", "local_ocr_diagnostics")
    }
}
