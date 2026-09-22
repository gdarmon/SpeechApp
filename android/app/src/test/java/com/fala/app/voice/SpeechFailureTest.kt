package com.fala.app.voice

import org.junit.Assert.*
import org.junit.Test

class SpeechFailureTest {
    @Test fun permissionsHaveActionableAdviceInBothLanguages() {
        assertTrue(SpeechFailure(9).message(false, false).contains("Microphone permission"))
        assertTrue(SpeechFailure(9).message(true, false).contains("אין הרשאה"))
        assertTrue(SpeechFailure(9).message(true, false).contains("עזרת המיקרופון"))
    }
    @Test fun unavailableLanguageDoesNotTellOnlineUsersToEnableNetworkAgain() {
        for (code in listOf(12, 13)) {
            assertTrue(SpeechFailure(code).message(false, false).contains("choose network"))
            assertFalse(SpeechFailure(code).message(false, true).contains("choose network"))
            assertTrue(SpeechFailure(code).message(false, true).contains("updates and language settings"))
        }
    }
    @Test fun unknownVendorErrorDoesNotInventPermissionDenial() {
        for (code in listOf(5, 11, 999)) {
            val message = SpeechFailure(code).message(false, true)
            assertTrue(message.contains("diagnostic report"))
            assertFalse(message.contains("permission is missing"))
        }
    }
    @Test fun silenceAndAudioFailureHaveDifferentRecoverySteps() {
        assertTrue(SpeechFailure(7).message(false, true).contains("wait for Listening"))
        assertTrue(SpeechFailure(3).message(false, true).contains("another app"))
        assertTrue(SpeechFailure(-4).message(false, true).contains("did not become ready"))
    }
}
