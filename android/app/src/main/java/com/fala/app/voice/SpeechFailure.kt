package com.fala.app.voice

data class SpeechFailure(val code: Int) {
    fun message(hebrew: Boolean, network: Boolean): String {
        fun words(he: String, en: String) = if (hebrew) he else en
        return when (code) {
            9 -> words("אין הרשאה למיקרופון. פתחו את עזרת המיקרופון כדי לאפשר אותה.",
                "Microphone permission is missing. Open Microphone help to allow it.")
            -1 -> words("זיהוי דיבור ללא רשת אינו זמין במכשיר. בעזרת המיקרופון אפשר לבחור זיהוי דרך הרשת.",
                "On-device recognition is unavailable. In Microphone help you can choose network recognition.")
            -2 -> words("לא נמצא שירות זיהוי דיבור פעיל במכשיר. בדקו את שירותי הדיבור בהגדרות Android.",
                "No active speech recognition service was found. Check the speech services in Android settings.")
            12, 13 -> if (!network) words("שפת הדיבור אינה זמינה לזיהוי מקומי. בעזרת המיקרופון אפשר לבחור זיהוי דרך הרשת.",
                "This language is unavailable for on-device recognition. In Microphone help you can choose network recognition.")
                else words("שירות הדיבור במכשיר אינו מצליח להשתמש בשפה הזאת. בדקו את העדכונים והשפות של שירות הדיבור.",
                    "Your phone’s speech service cannot use this language. Check its updates and language settings.")
            3 -> words("המכשיר לא הצליח לפתוח את המיקרופון. בדקו שהגישה למיקרופון מופעלת ושאין אפליקציה אחרת שמשתמשת בו.",
                "The phone could not open the microphone. Check microphone access and whether another app is using it.")
            8, 10 -> words("שירות זיהוי הדיבור עסוק. המתינו רגע ונסו שוב. אם זה חוזר, שתפו דוח תקלה מעזרת המיקרופון.",
                "The speech service is busy. Wait a moment and try again. If it repeats, share a report from Microphone help.")
            1, 2 -> words("החיבור של שירות זיהוי הדיבור נקטע. בדקו את החיבור לרשת ונסו שוב.",
                "The speech service lost its connection. Check your connection and try again.")
            6, 7 -> words("לא זוהו מילים. החזיקו את הכפתור, המתינו למצב האזנה ודברו, או הקלידו תשובה.",
                "No words were recognized. Hold, wait for Listening, then speak, or type your reply.")
            -4 -> words("שירות הדיבור לא היה מוכן בזמן. נסו שוב; אם זה חוזר, פתחו את עזרת המיקרופון ושתפו דוח תקלה.",
                "The speech service did not become ready in time. Retry; if it repeats, open Microphone help and share a report.")
            else -> words("שירות זיהוי הדיבור הפסיק לפעול. פתחו את עזרת המיקרופון לבדיקת ההגדרות ולשיתוף דוח תקלה.",
                "The phone’s speech service stopped. Open Microphone help to check settings and share a diagnostic report.")
        }
    }
}
