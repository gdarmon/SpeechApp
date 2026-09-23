package com.fala.app.voice

import org.junit.Assert.*
import org.junit.Test

class PlaybackFailureTest {
    @Test fun missingDownloadsAreNotPlayableAndOfflineDefaultWins() {
        val choices = listOf(
            PlaybackVoice("download", "pt", "BR", false, false),
            PlaybackVoice("online", "pt", "BR", true, true),
            PlaybackVoice("pt-PT", "pt", "PT", false, true),
            PlaybackVoice("a", "pt", "BR", false, true),
            PlaybackVoice("z-default", "pt", "BR", false, true))
        assertEquals(listOf("z-default", "a", "online"), playbackVoices(choices, "z-default").map { it.name })
        assertTrue(playbackVoices(choices.take(1), "download").isEmpty())
    }
    @Test fun playbackCodesGiveSpecificRecoveryWithoutMicrophoneAdvice() {
        assertTrue(PlaybackFailure(-9).message(false).contains("install"))
        assertTrue(PlaybackFailure(-9).message(true).contains("התקינו"))
        assertTrue(PlaybackFailure(-6).message(false).contains("internet"))
        assertTrue(PlaybackFailure(-5).message(false).contains("media volume"))
        assertTrue(PlaybackFailure(-3).message(false).contains("speech engine"))
        assertTrue(PlaybackFailure(PlaybackFailure.TIMEOUT).message(false).contains("respond in time"))
        for (code in listOf(-9, -6, -5, -3, -4, -1, 9, 999)) {
            assertFalse(PlaybackFailure(code).message(false).contains("microphone", ignoreCase = true))
            assertFalse(PlaybackFailure(code).message(true).contains("מיקרופון"))
        }
    }
}
