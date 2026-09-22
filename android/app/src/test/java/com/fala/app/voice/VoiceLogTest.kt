package com.fala.app.voice

import org.junit.Assert.*
import org.junit.Test

class VoiceLogTest {
    @Test fun reportKeepsOnlyRecentStepsInOrderAndCanBeCleared() {
        var now = 0L
        val log = VoiceLog(clock = { now++ }, limit = 3)
        log.record(VoiceEvent.HOLD_START)
        log.record(VoiceEvent.MICROPHONE_PERMISSION, 1, operation = VoiceOperation.CHECK_PERMISSION)
        log.record(VoiceEvent.RECOGNITION_START, language = "pt-BR", network = false)
        log.record(VoiceEvent.RECOGNITION_ERROR, 13, operation = VoiceOperation.RECOGNITION_CALLBACK)
        val lines = log.text().lines()
        assertEquals(3, lines.size)
        assertFalse(log.text().contains("HOLD_START"))
        assertTrue(lines.first().contains("CHECK_PERMISSION code=1"))
        assertTrue(lines[1].contains("language=pt-BR network=false"))
        assertTrue(lines.last().contains("RECOGNITION_CALLBACK code=13"))
        log.clear()
        assertFalse(log.text().contains("RECOGNITION_ERROR"))
    }

    @Test fun freeTextCannotLeakViaLanguageField() {
        val log = VoiceLog(clock = { 0 })
        log.record(VoiceEvent.RECOGNITION_START, language = "private@example.invalid\nBearer secret-token")
        assertEquals("1970-01-01T00:00:00Z RECOGNITION_START language=other", log.text())
    }

    @Test fun permissionDenialAndServiceFailureRemainDistinguishable() {
        val log = VoiceLog(clock = { 0 })
        log.record(VoiceEvent.MICROPHONE_PERMISSION, 0, operation = VoiceOperation.REQUEST_PERMISSION)
        log.record(VoiceEvent.RECOGNITION_ERROR, 9, operation = VoiceOperation.CHECK_PERMISSION)
        log.record(VoiceEvent.RECOGNITION_ERROR, 5, operation = VoiceOperation.RECOGNITION_CALLBACK)
        assertTrue(log.text().contains("MICROPHONE_PERMISSION operation=REQUEST_PERMISSION code=0"))
        assertTrue(log.text().contains("RECOGNITION_ERROR operation=CHECK_PERMISSION code=9"))
        assertTrue(log.text().contains("RECOGNITION_ERROR operation=RECOGNITION_CALLBACK code=5"))
    }
}
