package com.fala.app

import org.junit.Assert.*
import org.junit.Test

class ReplySupportTest {
    @Test fun hidingAnAlreadyReadIdeaDoesNotEraseAssistance() {
        val shown = ReplySupport.start(listenFirst = false, showIdeas = true)
        assertTrue(shown.usedIdeas)
        assertTrue(shown.hideIdeas().usedIdeas)
        assertFalse(shown.hideIdeas().ideasVisible)
        assertFalse(ReplySupport.start(listenFirst = false, showIdeas = false).usedIdeas)
    }

    @Test fun listeningAndReadingTheQuestionDoNotRevealTheAnswer() {
        val listening = ReplySupport.start(listenFirst = true, showIdeas = true)
        assertFalse(listening.textVisible)
        assertFalse(listening.ideasVisible)
        assertFalse(listening.revealText().usedIdeas)
        assertFalse(listening.revealText().ideasVisible)
        assertTrue(listening.revealIdeas().usedIdeas)
    }

    @Test fun helpAndResumedRepliesStayGuidedUntilTheNextQuestion() {
        assertTrue(ReplySupport.start(listenFirst = true, showIdeas = false, helped = true).usedIdeas)
        assertFalse(ReplySupport.start(listenFirst = true, showIdeas = false).usedIdeas)
    }
}
