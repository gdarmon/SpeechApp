package com.fala.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerErrorsTest {
    @Test fun providerLimitsKeepTheirWaitInstructions() {
        val detail = "Fala's AI provider has reached its usage limit. Wait 31 seconds, then tap Retry."
        assertEquals(detail, serverErrorMessage(429, "/sessions/test/turns", detail, "ai_rate_limited"))
    }

    @Test fun knownFailuresExplainRecoveryWithoutShowingRawServerErrors() {
        for (code in listOf("ai_timeout", "ai_invalid_reply", "ai_unavailable", "")) {
            val result = serverErrorMessage(503, "/sessions/test/turns", "private database details", code)
            assertFalse(result.contains("private"))
            assertTrue(result.contains("Retry", ignoreCase = true) || result.contains("try again"))
        }
        assertTrue(serverErrorMessage(503, "/sessions/test/turns", "", "ai_timeout").contains("too long"))
        assertTrue(serverErrorMessage(503, "/sessions/test/turns", "", "ai_invalid_reply").contains("prepare"))
    }
}
