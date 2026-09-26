package com.fala.app.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerErrorsTest {
    @Test fun capacityErrorsDoNotShowQuotaCountdowns() {
        for (code in listOf("ai_rate_limited", "ai_unavailable")) {
            val result = serverErrorMessage(429, "/sessions/test/turns", "Wait 31 seconds.", code)
            assertFalse(result.contains("31"))
            assertTrue(result.contains("answer is still here"))
        }
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
