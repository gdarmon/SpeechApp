package com.fala.app.voice

/** Playback codes are deliberately separate from recognition (microphone) codes. */
data class PlaybackFailure(val code: Int, val operation: VoiceOperation = VoiceOperation.PLAYBACK_CALLBACK) {
    fun message(hebrew: Boolean): String {
        val text = when {
            operation == VoiceOperation.REQUEST_AUDIO_FOCUS ->
                "ההשמעה נעצרה כי יישום אחר משתמש בקול. סגרו אותו ולחצו שוב על Listen." to
                "Another app is using audio. Close it and tap Listen again."
            code == MISSING_VOICE || code == -9 ->
                "הקול בפורטוגזית ברזילאית אינו מותקן או שעדיין יורד. פתחו עזרת השמעה והתקינו Português (Brasil)." to
                "The Brazilian Portuguese voice is missing or still downloading. Open Playback help and install Português (Brasil)."
            code == -6 || code == -7 ->
                "הקול שנבחר במכשיר זקוק לחיבור לאינטרנט. בדקו את החיבור, או התקינו קול פורטוגזי לשימוש ללא אינטרנט בעזרת השמעה." to
                "Your phone's selected voice needs internet. Check the connection, or install an offline Portuguese voice in Playback help."
            code == -5 ->
                "המכשיר לא הצליח להשמיע קול. בדקו את עוצמת המדיה ואת החיבור לאוזניות, ונסו שוב." to
                "Your phone could not play audio. Check media volume and headphone output, then try again."
            code == TIMEOUT ->
                "שירות ההקראה לא הגיב בזמן. לחצו שוב על Listen. אם זה חוזר, פתחו עזרת השמעה." to
                "Your phone's text-to-speech service did not respond in time. Retry Listen, or open Playback help if it happens again."
            else ->
                "שירות ההקראה במכשיר לא הצליח להשמיע את המשפט. פתחו עזרת השמעה לבדיקת הקול הפורטוגזי או לבחירת מנוע הקראה אחר." to
                "Your phone's text-to-speech service could not play this phrase. Open Playback help to check the Portuguese voice or choose another speech engine."
        }
        return if (hebrew) text.first else text.second
    }

    companion object {
        const val MISSING_VOICE = -101
        const val TIMEOUT = -102
    }
}

internal data class PlaybackVoice(val name: String, val language: String, val country: String,
    val network: Boolean, val installed: Boolean)

/** Use an installed Brazilian voice, prefer offline, then the engine's own default. */
internal fun playbackVoices(voices: List<PlaybackVoice>, defaultName: String?): List<PlaybackVoice> =
    voices.filter { it.language == "pt" && it.country == "BR" && it.installed }
        .sortedWith(compareBy<PlaybackVoice> { it.network }.thenBy { it.name != defaultName }.thenBy { it.name })
