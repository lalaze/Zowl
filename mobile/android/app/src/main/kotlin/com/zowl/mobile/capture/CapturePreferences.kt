package com.zowl.mobile.capture

import android.content.Context
import com.zowl.mobile.NativeLanguage
import org.json.JSONObject
import java.util.UUID

data class CaptureSession(
    val apiBaseUrl: String,
    val token: String,
    val userId: String,
)

class CapturePreferences(context: Context) {
    private val appContext = context.applicationContext
    // Kept from the zeMoney name: renaming it would reset existing users' capture settings and session.
    private val preferences =
        appContext.getSharedPreferences("zemoney_payment_capture", Context.MODE_PRIVATE)

    // Errors are kept as CaptureError values and worded when read, in the app's current language.
    private fun render(stored: String?): String? =
        CaptureError.render(stored) { text, args -> NativeLanguage.localized(appContext).getString(text, *args) }

    var enabled: Boolean
        get() = preferences.getBoolean("enabled", false)
        set(value) = preferences.edit().putBoolean("enabled", value).apply()

    fun pageSession(platform: String, ownerUserId: String): PaymentPageSession {
        val raw = preferences.getString("page_session_$platform", null)
        return runCatching {
            val json = JSONObject(requireNotNull(raw))
            require(json.getString("owner") == ownerUserId)
            PaymentPageSession(json.getString("id"), json.getBoolean("consumed"), json.getBoolean("checkout"))
        }.getOrElse { PaymentPageSession() }
    }

    fun savePageSession(platform: String, ownerUserId: String, state: PaymentPageSession): Boolean {
        // Only an opaque session ID and state flags; no page text or financial facts.
        val key = "page_session_$platform"
        val value = JSONObject()
            .put("owner", ownerUserId).put("id", state.id)
            .put("consumed", state.consumed).put("checkout", state.checkoutVisible).toString()
        if (preferences.getString(key, null) == value) return true
        // Persist the identity before enqueue so a process death cannot mint a new one.
        return preferences.edit().putString(key, value).commit()
    }

    fun isSourceEnabled(platform: String): Boolean =
        preferences.getBoolean("source_$platform", platform == "alipay")

    fun hasSourcePreference(platform: String): Boolean =
        preferences.contains("source_$platform")

    fun setSourceEnabled(
        platform: String,
        enabled: Boolean,
    ) {
        require(platform in PaymentPageParser.platforms)
        preferences.edit().putBoolean("source_$platform", enabled).apply()
    }

    /**
     * Whether the order pages around a shopping-app payment are uploaded with it so the server
     * can list what was bought (ADR-0014). Off until the user turns it on.
     */
    var orderDetailsEnabled: Boolean
        get() = preferences.getBoolean("order_details_enabled", false)
        set(value) = preferences.edit().putBoolean("order_details_enabled", value).apply()

    val installationId: String
        get() {
            preferences.getString("installation_id", null)?.let { return it }
            return UUID.randomUUID().toString().also {
                preferences.edit().putString("installation_id", it).apply()
            }
        }

    val queueOwnerUserId: String?
        get() = preferences.getString(QUEUE_OWNER_USER_ID, null)?.takeIf { it.isNotBlank() }

    fun session(): CaptureSession? {
        val encrypted = preferences.getString(SESSION_BINDING, null)
        if (encrypted == null) {
            clearLegacyCredentials()
            return null
        }
        return runCatching {
            val json =
                JSONObject(
                    AndroidKeystoreCipher.decrypt(encrypted).toString(Charsets.UTF_8),
                )
            CaptureSession(
                apiBaseUrl = json.getString("apiBaseUrl").trimEnd('/'),
                token = json.getString("token"),
                userId = json.getString("userId"),
            ).takeIf {
                it.apiBaseUrl.isNotBlank() && it.token.isNotBlank() && it.userId.isNotBlank()
            }
        }.getOrNull().also {
            if (it == null) {
                preferences.edit().remove(SESSION_BINDING).apply()
            }
        }
    }

    fun configureSession(
        apiBaseUrl: String,
        token: String,
        userId: String,
    ) = synchronized(CaptureAccountLock.monitor) {
        val binding =
            JSONObject()
                .put("apiBaseUrl", apiBaseUrl.trimEnd('/'))
                .put("token", token)
                .put("userId", userId)
        val encrypted =
            AndroidKeystoreCipher.encrypt(binding.toString().toByteArray(Charsets.UTF_8))
        preferences
            .edit()
            .putString(SESSION_BINDING, encrypted)
            .putString(QUEUE_OWNER_USER_ID, userId)
            .putBoolean("auth_paused", false)
            .remove("last_error")
            .remove("api_base_url")
            .remove("access_token")
            .apply()
    }

    fun clearSession() =
        synchronized(CaptureAccountLock.monitor) {
            preferences
                .edit()
                .remove(SESSION_BINDING)
                .remove(QUEUE_OWNER_USER_ID)
                .remove("api_base_url")
                .remove("access_token")
                .putBoolean("auth_paused", false)
                .remove("last_error")
                .apply()
        }

    fun pauseSession() =
        synchronized(CaptureAccountLock.monitor) {
            preferences
                .edit()
                .remove(SESSION_BINDING)
                .remove("api_base_url")
                .remove("access_token")
                .putBoolean("auth_paused", true)
                .apply()
        }

    fun pauseSessionIfOwnedBy(userId: String): Boolean =
        synchronized(CaptureAccountLock.monitor) {
            if (session()?.userId != userId) return@synchronized false
            preferences
                .edit()
                .remove(SESSION_BINDING)
                .putBoolean("auth_paused", true)
                .putString("last_error", CaptureError.SESSION_EXPIRED.store())
                .apply()
            true
        }

    fun markSyncSucceeded(userId: String): Boolean =
        synchronized(CaptureAccountLock.monitor) {
            if (session()?.userId != userId) return@synchronized false
            preferences
                .edit()
                .putBoolean("auth_paused", false)
                .remove("last_error")
                .apply()
            true
        }

    fun setLastErrorIfOwnedBy(
        userId: String,
        error: CaptureError,
        vararg args: Any,
    ): Boolean =
        synchronized(CaptureAccountLock.monitor) {
            if (session()?.userId != userId) return@synchronized false
            preferences.edit().putString("last_error", error.store(*args)).apply()
            true
        }

    var lastCaptureAt: Long
        get() = preferences.getLong("last_capture_at", 0)
        set(value) = preferences.edit().putLong("last_capture_at", value).apply()

    val authPaused: Boolean
        get() = preferences.getBoolean("auth_paused", false)

    val lastError: String?
        get() = render(preferences.getString("last_error", null))

    fun clearLastError() = preferences.edit().remove("last_error").apply()

    private fun clearLegacyCredentials() {
        if (!preferences.contains("api_base_url") && !preferences.contains("access_token")) return
        preferences.edit().remove("api_base_url").remove("access_token").apply()
    }

    companion object {
        private const val SESSION_BINDING = "session_binding_v2"
        private const val QUEUE_OWNER_USER_ID = "queue_owner_user_id"
    }
}
