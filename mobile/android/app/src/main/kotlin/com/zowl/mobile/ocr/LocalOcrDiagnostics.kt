package com.zowl.mobile.ocr

import android.content.Context
import com.zowl.mobile.ocr.LocalOcrDiagnosticsSchema.Stage
import com.zowl.mobile.ocr.LocalOcrDiagnosticsSchema.Reason
import com.zowl.mobile.ocr.LocalOcrDiagnosticsSchema.Metric

/** Local, bounded, content-free diagnostics. No capture decisions depend on persistence succeeding. */
class LocalOcrDiagnostics(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    fun record(stage: Stage, reason: Reason, metrics: Map<Metric, Int> = emptyMap()) = synchronized(lock) {
        try { persist(LocalOcrDiagnosticsSchema.record(prefs.all, stage, reason, metrics)) } catch (_: Exception) { }
    }
    fun listening() = synchronized(lock) {
        try { persist(LocalOcrDiagnosticsSchema.listening(prefs.all)) } catch (_: Exception) { }
    }
    fun snapshot(): Map<String, Any> = synchronized(lock) {
        try { LocalOcrDiagnosticsSchema.sanitize(prefs.all) } catch (_: Exception) { emptyMap() }
    }
    fun reset() = synchronized(lock) { prefs.edit().clear().apply() }

    private fun persist(values: Map<String, Any>) {
        val edit = prefs.edit().clear()
        values.forEach { (key, value) -> when (value) {
            is Int -> edit.putInt(key, value)
            is String -> edit.putString(key, value)
        } }
        edit.apply()
    }
    companion object {
        const val FILE_NAME = "local_ocr_diagnostics"
        private val lock = Any()
    }
}
