package com.zowl.mobile

import android.content.Context
import android.content.res.Configuration
import android.content.res.Resources
import androidx.core.os.ConfigurationCompat
import java.util.Locale

/** The language picked in the app's settings; mirrors `AppLanguage` in lib/core/l10n.dart. */
enum class AppLanguage(val wireName: String) {
    SYSTEM("system"),
    ZH("zh"),
    EN("en"),
    ;

    companion object {
        fun fromWireName(name: String?): AppLanguage? = entries.firstOrNull { it.wireName == name }
    }
}

/**
 * Native text (notifications, toasts, the Quick Settings tile, capture errors shown in the app and
 * the `Accept-Language` of native requests) follows the language chosen in the app, not the
 * phone's. Flutter pushes the choice over the `com.zowl.mobile/language` channel at start and on
 * every change; it is kept here so workers, the notification listener, the accessibility service
 * and the tile use it while Flutter isn't running.
 *
 * Look up every native string through [localized]. Labels from the manifest (the accessibility
 * service and notification access lists) are drawn by system Settings in the phone's language.
 */
object NativeLanguage {
    private const val PREFERENCES = "zowl_native_language"
    private const val LANGUAGE = "language"

    fun current(context: Context): AppLanguage =
        AppLanguage.fromWireName(preferences(context).getString(LANGUAGE, null)) ?: AppLanguage.SYSTEM

    /** Keeps [language] for native code; returns whether it differs from the one kept before. */
    fun save(
        context: Context,
        language: AppLanguage,
    ): Boolean {
        if (current(context) == language) return false
        preferences(context).edit().putString(LANGUAGE, language.wireName).apply()
        return true
    }

    /**
     * [context] itself when the app follows the phone, otherwise a context whose resources are in
     * the chosen language. Use it for string lookups only; keep [context] for everything else.
     */
    fun localized(context: Context): Context {
        val locale = localeFor(current(context)) ?: return context
        val configuration = Configuration(context.resources.configuration)
        configuration.setLocale(locale)
        return context.createConfigurationContext(configuration)
    }

    /** `Accept-Language` for native requests, so the server writes its text in the app's language. */
    fun acceptLanguage(context: Context): String = acceptLanguage(current(context), deviceLocale())

    /** The locale native text is forced to, or null to follow the phone. */
    fun localeFor(language: AppLanguage): Locale? =
        when (language) {
            AppLanguage.SYSTEM -> null
            AppLanguage.ZH -> Locale.SIMPLIFIED_CHINESE
            AppLanguage.EN -> Locale.US
        }

    fun acceptLanguage(
        language: AppLanguage,
        deviceLocale: Locale,
    ): String = if (resolvesToChinese(language, deviceLocale)) "zh-CN" else "en-US"

    /** Same rule as `resolvesToChinese` in lib/core/l10n.dart. */
    fun resolvesToChinese(
        language: AppLanguage,
        deviceLocale: Locale,
    ): Boolean =
        when (language) {
            AppLanguage.ZH -> true
            AppLanguage.EN -> false
            AppLanguage.SYSTEM -> deviceLocale.language == "zh"
        }

    private fun deviceLocale(): Locale =
        ConfigurationCompat.getLocales(Resources.getSystem().configuration)[0] ?: Locale.getDefault()

    private fun preferences(context: Context) =
        context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
}
