package com.fala.app

import org.junit.Assert.assertEquals
import org.junit.Test

class ReplySpeechTest {
    @Test fun speaksCorrectionBeforeNextQuestion() {
        assertEquals("Eu quero café. Com leite?", replySpeech("Com leite?", "correction", "Eu quero café"))
    }
    @Test fun doesNotRepeatCorrectionAlreadyInReply() {
        assertEquals("Eu quero café! Com leite?", replySpeech("Eu quero café! Com leite?", "correction", "Eu quero café."))
    }
    @Test fun ordinaryRepliesSpeakOnlyPortugueseText() {
        assertEquals("Com leite?", replySpeech("Com leite?", "ok", ""))
    }
}
