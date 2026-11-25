package com.zowl.mobile.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class QuickConfirmActionTest {
    @Test
    fun `normalizes merchant input and binds the action to its capture owner`() {
        val action =
            QuickConfirmAction.create(
                captureId = "capture-1",
                ownerUserId = "user-1",
                merchantName = "  山岚咖啡  ",
                createdAtEpochMillis = 1234L,
            )

        assertEquals("capture-1", action.captureId)
        assertEquals("user-1", action.ownerUserId)
        assertEquals("山岚咖啡", action.merchantName)
        assertEquals(1234L, action.createdAtEpochMillis)
    }

    @Test
    fun `rejects blank merchant replies`() {
        assertThrows(IllegalArgumentException::class.java) {
            QuickConfirmAction.create(
                captureId = "capture-1",
                ownerUserId = "user-1",
                merchantName = "   ",
            )
        }
    }
}
