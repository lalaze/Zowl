package com.zowl.mobile.ocr

import android.app.Activity
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import com.zowl.mobile.MainActivity
import com.zowl.mobile.NativeLanguage
import com.zowl.mobile.R
import com.zowl.mobile.capture.CaptureNotificationPublisher
import com.zowl.mobile.ocr.LocalOcrDiagnosticsSchema.Stage
import com.zowl.mobile.ocr.LocalOcrDiagnosticsSchema.Reason
import com.zowl.mobile.ocr.LocalOcrDiagnosticsSchema.Metric

class LocalOcrTileService : TileService() {
    override fun onStartListening() {
        LocalOcrDiagnostics(this).listening()
        qsTile?.apply {
            // The manifest label is only the system's fallback; this one follows the app's language.
            label = NativeLanguage.localized(this@LocalOcrTileService).getString(R.string.local_ocr_tile_label)
            state = if (Build.VERSION.SDK_INT < 34) Tile.STATE_UNAVAILABLE else Tile.STATE_INACTIVE
            updateTile()
        }
    }

    override fun onClick() {
        val diagnostics = LocalOcrDiagnostics(this)
        diagnostics.record(Stage.TILE_CLICK, Reason.RECEIVED)
        if (Build.VERSION.SDK_INT < 34) {
            diagnostics.record(Stage.ELIGIBILITY, Reason.UNSUPPORTED_API)
            return LocalOcrCapture.message(this, R.string.local_ocr_requires_android_14)
        }
        if (isLocked || !LocalOcrCapture.unlocked(this)) {
            diagnostics.record(Stage.ELIGIBILITY, Reason.LOCKED)
            return LocalOcrCapture.message(this, R.string.local_ocr_unlock_first)
        }
        val enabled = LocalOcrCapture.enabled(this)
        val connected = LocalOcrCapture.service != null
        val ownerPresent = LocalOcrCapture.state.owner() != null
        val eligibility = when {
            !enabled -> Reason.DISABLED
            !connected -> Reason.SERVICE_MISSING
            !ownerPresent -> Reason.OWNER_MISSING
            else -> Reason.READY
        }
        diagnostics.record(Stage.ELIGIBILITY, eligibility, mapOf(
            Metric.ENABLED to if (enabled) 1 else 0,
            Metric.SERVICE_PRESENT to if (connected) 1 else 0,
            Metric.OWNER_PRESENT to if (ownerPresent) 1 else 0,
        ))
        if (!enabled || !connected || !ownerPresent) {
            // Say why on screen: opening the settings page may itself be blocked by the OS.
            LocalOcrCapture.message(this, when {
                !enabled -> R.string.local_ocr_disabled
                !connected -> R.string.local_ocr_service_not_connected
                else -> R.string.local_ocr_owner_missing
            })
            collapse(Intent(this, MainActivity::class.java)
                .putExtra(CaptureNotificationPublisher.ROUTE_EXTRA, LocalOcrCapture.SETTINGS_ROUTE))
            return
        }
        if (LocalOcrCapture.state.busy()) {
            diagnostics.record(Stage.ELIGIBILITY, Reason.BUSY)
            return LocalOcrCapture.message(this, R.string.local_ocr_busy)
        }
        val request = LocalOcrCapture.prepare(this)
            ?: return LocalOcrCapture.message(this, R.string.local_ocr_cannot_start)
        LocalOcrCapture.message(this, R.string.local_ocr_scanning)
        // Opaque trampoline only; never put financial data into Intents or PendingIntents.
        LocalOcrCapture.begin(request.id) { collapse(Intent(this, LocalOcrCollapseActivity::class.java)) }
    }

    private fun collapse(intent: Intent) {
        val diagnostics = LocalOcrDiagnostics(this)
        diagnostics.record(Stage.COLLAPSE, if (intent.component?.className == MainActivity::class.java.name)
            Reason.SETTINGS_REQUESTED else Reason.REQUESTED)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startActivityAndCollapse(PendingIntent.getActivity(this, 7130, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            }
        } catch (_: Exception) {
            diagnostics.record(Stage.COLLAPSE, Reason.LAUNCH_ERROR)
            LocalOcrCapture.state.clear()
            LocalOcrCapture.message(this, R.string.local_ocr_collapse_failed)
        }
    }

    companion object {
        /**
         * Asks the system to bind the tile so [onStartListening] relabels it after a language
         * switch. Android may ignore this for a tile that isn't an active tile; the label is then
         * updated the next time the Quick Settings panel opens.
         */
        fun requestRelabel(context: Context) {
            try {
                TileService.requestListeningState(context, ComponentName(context, LocalOcrTileService::class.java))
            } catch (_: Exception) {
                // Not added, another user, or the system refused: the next panel opening relabels it.
            }
        }
    }
}

/** Translucent, no-history, non-exported trampoline; only a fallback way to collapse the panel. */
class LocalOcrCollapseActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        LocalOcrDiagnostics(this).record(Stage.COLLAPSE, Reason.ACTIVITY_ENTERED)
        finish()
    }
}
