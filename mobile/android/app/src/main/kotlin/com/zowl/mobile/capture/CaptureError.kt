package com.zowl.mobile.capture

import androidx.annotation.StringRes
import com.zowl.mobile.R
import java.net.URLDecoder
import java.net.URLEncoder

/**
 * Sync errors that the app's capture settings show. They are stored by their string
 * resource's name plus format arguments, never as finished text (resource IDs change between
 * builds, so the name is what is kept), and only worded when the app reads the status. A switch of
 * the app's language therefore also rewords errors written before it.
 */
enum class CaptureError(
    val key: String,
    @get:StringRes val text: Int,
) {
    SESSION_EXPIRED("capture_error_session_expired", R.string.capture_error_session_expired),
    CANNOT_CONNECT("capture_error_cannot_connect", R.string.capture_error_cannot_connect),
    SOME_REJECTED("capture_error_some_rejected", R.string.capture_error_some_rejected),
    PROTOCOL("capture_error_protocol", R.string.capture_error_protocol),
    SYNC_FAILED("capture_error_sync_failed", R.string.capture_error_sync_failed),
    NETWORK("capture_error_network", R.string.capture_error_network),
    QUICK_CONFIRM_REJECTED("capture_error_quick_confirm_rejected", R.string.capture_error_quick_confirm_rejected),
    QUICK_CONFIRM_RETRY("capture_error_quick_confirm_retry", R.string.capture_error_quick_confirm_retry),
    ;

    /** The value to keep in SharedPreferences: `capture-error:<key>` then `|d<int>` or `|s<url-encoded text>` per argument. */
    fun store(vararg args: Any): String =
        buildString {
            append(PREFIX).append(key)
            args.forEach { arg ->
                append(SEPARATOR)
                when (arg) {
                    is Int, is Long -> append('d').append(arg)
                    else -> append('s').append(URLEncoder.encode(arg.toString(), "UTF-8"))
                }
            }
        }

    companion object {
        private const val PREFIX = "capture-error:"
        private const val SEPARATOR = '|'

        /**
         * The text for a stored value, worded by [getString] (a lookup in the app's current
         * language). Plain text written by older versions is returned as it is; a stored error
         * this build doesn't know (after a downgrade) or can't decode is dropped.
         */
        fun render(
            stored: String?,
            getString: (Int, Array<Any>) -> String,
        ): String? {
            if (stored == null || !stored.startsWith(PREFIX)) return stored
            val parts = stored.removePrefix(PREFIX).split(SEPARATOR)
            val error = entries.firstOrNull { it.key == parts.first() } ?: return null
            val args =
                parts.drop(1).map { part ->
                    when (part.firstOrNull()) {
                        'd' -> part.drop(1).toLongOrNull() ?: return null
                        's' -> URLDecoder.decode(part.drop(1), "UTF-8")
                        else -> return null
                    }
                }
            return getString(error.text, args.toTypedArray())
        }
    }
}
