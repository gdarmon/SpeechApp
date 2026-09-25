package com.fala.app

import org.junit.Assert.*
import org.junit.Test

class UiLanguageTest {
    @Test fun translatesControlsNestedLabelsAndErrorsWithoutChangingPortuguese() {
        assertEquals("מתחילים לדבר", uiText("Talk", "he-IL"))
        assertEquals("Talk", uiText("Talk", "en-US"))
        assertEquals("רמת תרגול 1 · ביטויים ראשונים", uiText("Practice level 1 · First phrases", "he-IL"))
        assertEquals("2000 נקודות", uiText("2000 XP", "he-IL"))
        assertEquals("התשובה שלכם… בדיבור או בהקלדה", uiText("Your reply… speak or type", "he-IL"))
        assertEquals("התחברו שוב ל־Fala.", uiText("Please sign in to Fala again.", "he-IL"))
        assertEquals("Qual nome quer ouvir?", uiText("Qual nome quer ouvir?", "he-IL"))
    }
}
