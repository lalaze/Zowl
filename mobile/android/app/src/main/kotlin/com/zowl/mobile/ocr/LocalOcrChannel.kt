package com.zowl.mobile.ocr

import android.app.Activity
import android.app.StatusBarManager
import android.content.ComponentName
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.provider.Settings
import android.view.WindowManager
import com.zowl.mobile.capture.CaptureNotificationPublisher
import com.zowl.mobile.capture.PaymentAccessibilityService
import com.zowl.mobile.NativeLanguage
import com.zowl.mobile.R
import com.zowl.mobile.ocr.LocalOcrDiagnosticsSchema.Stage
import com.zowl.mobile.ocr.LocalOcrDiagnosticsSchema.Reason
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class LocalOcrChannel(private val activity: Activity) : MethodChannel.MethodCallHandler {
    private var pendingTileResult: MethodChannel.Result? = null

    private fun finishTileRequest(outcome: String, reason: Reason) {
        val result = pendingTileResult ?: return
        pendingTileResult = null
        LocalOcrDiagnostics(activity).record(Stage.TILE_ADD, reason)
        result.success(outcome)
    }

    fun dispose() {
        // Reply exactly once; a late system callback must not touch a destroyed Flutter screen.
        finishTileRequest("unavailable", Reason.UNAVAILABLE)
    }

    private fun requestAddTile(result: MethodChannel.Result) {
        if (pendingTileResult != null) {
            result.success("in_progress")
            return
        }
        pendingTileResult = result
        if (Build.VERSION.SDK_INT < 34 || activity.isFinishing || activity.isDestroyed) {
            finishTileRequest("unavailable", Reason.UNAVAILABLE)
            return
        }
        try {
            val manager = activity.getSystemService(StatusBarManager::class.java)
            if (manager == null) {
                finishTileRequest("unavailable", Reason.UNAVAILABLE)
                return
            }
            LocalOcrDiagnostics(activity).record(Stage.TILE_ADD, Reason.REQUESTED)
            // Android 13 introduced this API; OCR itself stays restricted to Android 14+.
            // Only the system/user can accept this request. No capture is started here.
            manager.requestAddTileService(
                ComponentName(activity, LocalOcrTileService::class.java),
                NativeLanguage.localized(activity).getString(R.string.local_ocr_tile_label),
                Icon.createWithResource(activity, R.drawable.ic_local_ocr_tile),
                activity.mainExecutor,
            ) { code ->
                when (code) {
                    StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ADDED -> finishTileRequest("added", Reason.ADDED)
                    StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ALREADY_ADDED -> finishTileRequest("already_added", Reason.ALREADY_ADDED)
                    StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_NOT_ADDED -> finishTileRequest("not_added", Reason.NOT_ADDED)
                    else -> finishTileRequest("unavailable", Reason.UNAVAILABLE)
                }
            }
        } catch (_: Exception) {
            // Never expose exception strings or make a second request automatically.
            finishTileRequest("unavailable", Reason.UNAVAILABLE)
        }
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        val state = LocalOcrCapture.state
        when (call.method) {
            "requestAddTile" -> requestAddTile(result)
            "diagnostics" -> result.success(LocalOcrDiagnostics(activity).snapshot())
            "resetDiagnostics" -> {
                LocalOcrDiagnostics(activity).reset()
                result.success(null)
            }
            "bindOwner" -> {
                state.bind(call.argument<String>("owner"))
                result.success(null)
            }
            "status" -> result.success(mapOf(
                "supported" to (Build.VERSION.SDK_INT >= 34),
                "enabled" to LocalOcrCapture.enabled(activity),
                "granted" to PaymentAccessibilityService.accessGranted(activity),
                "connected" to (LocalOcrCapture.service != null),
            ))
            "setEnabled" -> {
                LocalOcrCapture.setEnabled(activity, call.argument<Boolean>("enabled") == true)
                result.success(null)
            }
            "openAccess" -> {
                activity.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                result.success(null)
            }
            "takeDraft" -> {
                CaptureNotificationPublisher.clearLocalOcrReady(activity)
                val draft = state.take(call.argument<String>("owner") ?: "")
                if (draft == null) result.success(null) else result.success(mapOf(
                    "id" to draft.request.id,
                    "owner" to draft.request.owner,
                    "amount" to draft.amount,
                    "merchant" to draft.merchant,
                    "platform" to if (draft.request.packageName == "com.tencent.mm") "wechat" else "alipay",
                    "warning" to draft.warning,
                    "remainingMs" to state.remaining(),
                ))
            }
            "validate" -> result.success(LocalOcrCapture.enabled(activity) && state.valid(
                call.argument<String>("id") ?: "", call.argument<String>("owner") ?: ""))
            "discard" -> {
                // Never allow disposal of an older screen to clear a newer request.
                call.argument<String>("id")?.let { state.clear(it) }
                result.success(null)
            }
            "protectReview" -> {
                if (call.argument<Boolean>("visible") == true) activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }
}
