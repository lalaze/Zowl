package com.zowl.mobile

import android.app.Application
import com.zowl.mobile.capture.CaptureLog

class ZowlApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Every start of the process, whichever component it is for, and why the last one ended.
        CaptureLog.init(this)
        CaptureLog.onProcessStart()
    }
}
