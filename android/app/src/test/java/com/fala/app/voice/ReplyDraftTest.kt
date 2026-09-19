package com.fala.app.voice

import org.junit.Assert.*
import org.junit.Test

class ReplyDraftTest {
    @Test fun segmentsAcrossPausesStayInOneUnsentDraft() {
        val draft = ReplyDraft().segment("Bom dia!", 1200).segment("Quero um café.", 1800)
        assertEquals("Bom dia! Quero um café.", draft.text)
        assertEquals("speech", draft.source)
        assertEquals(3000L, draft.speechMs)
    }

    @Test fun editingRecognizedWordsDoesNotCountAsSpontaneousSpeech() {
        val draft = ReplyDraft().segment("Ontem eu vai", 2000).edited("Ontem eu fui")
        assertEquals("typed", draft.source)
        assertEquals(0L, draft.speechMs)
        assertEquals("Ontem eu fui", draft.text)
    }

    @Test fun SpeakingOrEditingAnIdeaKeepsItsAssistanceMarker() {
        val spoken = ReplyDraft(assisted = true).segment("Um café, por favor.", 1500)
        assertTrue(spoken.assisted)
        assertTrue(spoken.edited("Um chá, por favor.").assisted)
    }
}
