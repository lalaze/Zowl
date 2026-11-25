package com.zowl.mobile

import android.content.Intent
import android.net.Uri
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.Executors

/** Shared images remain in memory and are never persisted in the app's cache. */
class ScreenshotShareBridge(private val activity: FlutterActivity, messenger: BinaryMessenger) {
    private val channel = MethodChannel(messenger, "com.zowl.mobile/screenshot_share")
    private val executor = Executors.newSingleThreadExecutor()
    private var pending: Map<String, Any>? = null
    private var generation = 0

    init {
        channel.setMethodCallHandler { call, result ->
            when (call.method) {
                "takePendingScreenshot" -> { result.success(pending); pending = null }
                else -> result.notImplemented()
            }
        }
    }

    fun accept(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND) return
        val extension = when (intent.type) {
            "image/png" -> "png"
            "image/jpeg" -> "jpg"
            "image/webp" -> "webp"
            else -> return
        }
        val uri = if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            (intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri)
        } ?: return
        if (uri.scheme != "content") return
        // Consume the Intent so activity recreation cannot upload it again.
        intent.removeExtra(Intent.EXTRA_STREAM)
        intent.action = Intent.ACTION_MAIN
        val current = ++generation
        executor.execute {
            val result = runCatching {
                activity.contentResolver.openInputStream(uri)?.use { stream ->
                    val output = java.io.ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    while (true) {
                        val count = stream.read(buffer)
                        if (count < 0) break
                        require(output.size() + count <= 8 * 1024 * 1024)
                        output.write(buffer, 0, count)
                    }
                    require(output.size() > 0)
                    mapOf<String, Any>("bytes" to output.toByteArray(), "name" to "shared-screenshot.$extension")
                }
            }.getOrNull() ?: mapOf(
                "error" to NativeLanguage.localized(activity).getString(R.string.shared_screenshot_unreadable),
            )
            activity.runOnUiThread {
                if (current == generation && !activity.isDestroyed) {
                    pending = result
                    channel.invokeMethod("sharedScreenshotAvailable", null)
                }
            }
        }
    }

    fun dispose() { generation++; pending = null; executor.shutdownNow(); channel.setMethodCallHandler(null) }
}
