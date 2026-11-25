package com.zowl.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale

class NativeLanguageTest {
    @Test
    fun readsTheNamesFlutterSends() {
        assertEquals(AppLanguage.SYSTEM, AppLanguage.fromWireName("system"))
        assertEquals(AppLanguage.ZH, AppLanguage.fromWireName("zh"))
        assertEquals(AppLanguage.EN, AppLanguage.fromWireName("en"))
        assertNull(AppLanguage.fromWireName("fr"))
        assertNull(AppLanguage.fromWireName(null))
    }

    @Test
    fun aChoiceOverridesThePhoneAndSystemFollowsIt() {
        assertTrue(NativeLanguage.resolvesToChinese(AppLanguage.ZH, Locale.US))
        assertFalse(NativeLanguage.resolvesToChinese(AppLanguage.EN, Locale.SIMPLIFIED_CHINESE))
        assertTrue(NativeLanguage.resolvesToChinese(AppLanguage.SYSTEM, Locale.SIMPLIFIED_CHINESE))
        assertTrue(NativeLanguage.resolvesToChinese(AppLanguage.SYSTEM, Locale.TRADITIONAL_CHINESE))
        assertTrue(NativeLanguage.resolvesToChinese(AppLanguage.SYSTEM, Locale.forLanguageTag("zh-Hans-SG")))
        assertFalse(NativeLanguage.resolvesToChinese(AppLanguage.SYSTEM, Locale.UK))
        assertFalse(NativeLanguage.resolvesToChinese(AppLanguage.SYSTEM, Locale.JAPAN))
    }

    @Test
    fun nativeTextIsForcedOnlyForAnExplicitChoice() {
        assertNull(NativeLanguage.localeFor(AppLanguage.SYSTEM))
        assertEquals("zh-CN", NativeLanguage.localeFor(AppLanguage.ZH)?.toLanguageTag())
        assertEquals("en-US", NativeLanguage.localeFor(AppLanguage.EN)?.toLanguageTag())
    }

    @Test
    fun acceptLanguageIsZhCnOrEnUsForTheEffectiveLanguage() {
        assertEquals("zh-CN", NativeLanguage.acceptLanguage(AppLanguage.ZH, Locale.US))
        assertEquals("en-US", NativeLanguage.acceptLanguage(AppLanguage.EN, Locale.SIMPLIFIED_CHINESE))
        assertEquals("zh-CN", NativeLanguage.acceptLanguage(AppLanguage.SYSTEM, Locale.TRADITIONAL_CHINESE))
        assertEquals("en-US", NativeLanguage.acceptLanguage(AppLanguage.SYSTEM, Locale.UK))
        assertEquals("en-US", NativeLanguage.acceptLanguage(AppLanguage.SYSTEM, Locale.GERMANY))
    }
}
