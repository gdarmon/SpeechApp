package com.fala.app

import org.junit.Assert.*
import org.junit.Test

class UpdateOfferTest {
    private fun play(available: Int = 19, allowed: Boolean = true, offered: Boolean = true,
                     downloading: Boolean = false, downloaded: Boolean = false) =
        UpdateOffer.fromPlay(18, available, offered, allowed, downloading, downloaded)

    @Test fun `only offer a newer update allowed for this Play account`() {
        assertEquals(UpdateStage.AVAILABLE, play().stage)
        assertEquals(UpdateStage.NONE, play(available = 18).stage)
        assertEquals(UpdateStage.NONE, play(available = 17).stage)
        assertEquals(UpdateStage.NONE, play(offered = false).stage)
        assertEquals(UpdateStage.NONE, play(allowed = false).stage)
        assertEquals(UpdateStage.NONE, play(available = 0).stage)
    }

    @Test fun `recover an accepted download without requiring another offered flow`() {
        assertEquals(UpdateStage.DOWNLOADING, play(allowed = false, offered = false, downloading = true).stage)
        assertEquals(UpdateStage.READY, play(allowed = false, offered = false, downloaded = true).stage)
        assertEquals(UpdateStage.NONE, play(available = 18, downloaded = true).stage)
    }

    @Test fun `no prompts interrupt conversations or other busy or onboarding screens`() {
        for (stage in listOf(UpdateStage.AVAILABLE, UpdateStage.DOWNLOADING, UpdateStage.READY)) {
            val offer = UpdateOffer(19, stage)
            for (screen in listOf("talk", "welcome", "language", "feedback", "history", "friends", "rewards")) {
                assertFalse("$stage on $screen", offer.visible(screen, false, 0, 0, 0))
            }
            for (screen in listOf("home", "settings")) {
                assertTrue(offer.visible(screen, false, 0, 0, 0))
                assertFalse(offer.visible(screen, true, 0, 0, 0))
            }
        }
        assertFalse(UpdateOffer().visible("home", false, 0, 0, 0))
    }

    @Test fun `Later suppresses the same version on home and settings for a full day`() {
        val dismissedAt = 1000L
        val remindAfter = dismissedAt + UpdateOffer.REMIND_AFTER_MILLIS
        for (stage in listOf(UpdateStage.AVAILABLE, UpdateStage.READY)) {
            // These persisted values also apply after an Activity or app restart.
            val offer = UpdateOffer(19, stage)
            for (screen in listOf("home", "settings")) {
                assertFalse(offer.visible(screen, false, 19, remindAfter, dismissedAt))
                assertFalse(offer.visible(screen, false, 19, remindAfter, remindAfter - 1))
                assertTrue(offer.visible(screen, false, 19, remindAfter, remindAfter))
            }
        }
    }

    @Test fun `a different eligible update is not hidden by an older dismissal`() {
        assertTrue(play(available = 20).visible("home", false, 19, 99999, 1000))
        assertFalse(play(available = 20, offered = false).visible("home", false, 19, 99999, 1000))
    }

    @Test fun `download progress remains visible after a previous dismissal without interrupting practice`() {
        val offer = play(downloading = true)
        assertTrue(offer.visible("home", false, 19, 99999, 1000))
        assertFalse(offer.visible("talk", false, 19, 99999, 1000))
    }
}
