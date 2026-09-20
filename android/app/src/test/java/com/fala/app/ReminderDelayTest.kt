package com.fala.app

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.ZonedDateTime

class ReminderDelayTest {
    @Test fun afternoonReminderUsesLocalTimeAndDoesNotFireBeforeItsTime() {
        val now=ZonedDateTime.parse("2026-09-20T16:00:00+03:00[Asia/Jerusalem]")
        assertEquals(3_600_000L,reminderDelay(now,17*60,false))
        assertEquals(30_000L,reminderDelay(now.plusMinutes(75),17*60,false))
        assertEquals(23*3_600_000L,reminderDelay(now.plusHours(2),17*60,false))
    }
    @Test fun nextDayKeepsSeventeenOClockAcrossJerusalemClockChange() {
        val now=ZonedDateTime.parse("2026-10-24T17:00:00+03:00[Asia/Jerusalem]")
        assertEquals(25*3_600_000L,reminderDelay(now,17*60,true))
    }
}
