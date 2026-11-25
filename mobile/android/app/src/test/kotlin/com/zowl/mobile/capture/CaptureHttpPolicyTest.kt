package com.zowl.mobile.capture

import org.junit.Assert.assertEquals
import org.junit.Test

class CaptureHttpPolicyTest {
    @Test
    fun captureUploadRetainsProtocolErrorsAndRetriesOnlyTransientFailures() {
        assertEquals(
            CaptureUploadDisposition.ACCEPT_RESPONSE,
            CaptureUploadHttpPolicy.classify(201),
        )
        assertEquals(
            CaptureUploadDisposition.UNAUTHORIZED,
            CaptureUploadHttpPolicy.classify(401),
        )
        listOf(400, 403, 409, 422).forEach {
            assertEquals(
                CaptureUploadDisposition.PROTOCOL_ERROR,
                CaptureUploadHttpPolicy.classify(it),
            )
        }
        listOf(408, 429, 500, 503).forEach {
            assertEquals(
                CaptureUploadDisposition.RETRY,
                CaptureUploadHttpPolicy.classify(it),
            )
        }
    }

    @Test
    fun quickConfirmSeparatesReviewAuthTerminalAndRetryResponses() {
        assertEquals(
            QuickConfirmDisposition.COMPLETED,
            QuickConfirmHttpPolicy.classify(200),
        )
        assertEquals(
            QuickConfirmDisposition.NEEDS_REVIEW,
            QuickConfirmHttpPolicy.classify(409),
        )
        assertEquals(
            QuickConfirmDisposition.UNAUTHORIZED,
            QuickConfirmHttpPolicy.classify(401),
        )
        listOf(400, 403, 404, 422).forEach {
            assertEquals(
                QuickConfirmDisposition.TERMINAL_REJECTION,
                QuickConfirmHttpPolicy.classify(it),
            )
        }
        listOf(408, 429, 500, 503).forEach {
            assertEquals(
                QuickConfirmDisposition.RETRY,
                QuickConfirmHttpPolicy.classify(it),
            )
        }
    }
}
