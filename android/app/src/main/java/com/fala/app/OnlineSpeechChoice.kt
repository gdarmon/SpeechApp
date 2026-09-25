package com.fala.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/** The same informed, optional choice at sign-in, in the guide and in voice settings. */
@Composable
internal fun OnlineSpeechChoice(hebrew: Boolean, checked: Boolean, onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true) {
    fun words(he: String, en: String) = if (hebrew) he else en
    CompositionLocalProvider(LocalLayoutDirection provides if (hebrew) LayoutDirection.Rtl else LayoutDirection.Ltr) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(tr(words("תרגול בקול במקום בהקלדה", "Practice by speaking instead of typing")),
                style = MaterialTheme.typography.titleSmall)
            Text(tr(words(
                "אם המכשיר לא מצליח לזהות דיבור בעצמו, זיהוי דרך האינטרנט יכול לאפשר לכם לענות בקול. כדאי להפעיל אם המיקרופון נסגר מיד או שלא מופיעות מילים.",
                "Online recognition can let you reply by speaking when your phone’s on-device recognition does not work. Try enabling it if the microphone closes immediately or no words appear.")),
                style = MaterialTheme.typography.bodyMedium)
            Text(tr(words(
                "נדרש חיבור לאינטרנט. ספק זיהוי הדיבור של המכשיר עשוי לקבל את הקול שלכם.",
                "An internet connection is needed. Your phone’s speech provider may receive your audio.")),
                style = MaterialTheme.typography.bodyMedium)
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(
                value = checked, enabled = enabled, role = Role.Switch, onValueChange = onCheckedChange),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Switch(checked = checked, onCheckedChange = null, enabled = enabled)
                Text(tr(words("זיהוי דיבור דרך האינטרנט", "Use online speech recognition")), Modifier.weight(1f))
            }
            Text(tr(if (checked) words(
                "מופעל. כדי לדבר, אשרו גם גישה למיקרופון כש־Android מבקש זאת. אפשר לכבות את האפשרות כאן או בהגדרות בכל רגע.",
                "Enabled. To speak, also allow microphone access when Android asks. You can turn this off here or in Settings at any time.")
                else words(
                    "כבוי. Fala תנסה לזהות דיבור במכשיר בלבד. אפשר תמיד להקליד תשובה.",
                    "Off. Fala will try on-device recognition only. You can always type your reply.")),
                style = MaterialTheme.typography.bodyMedium)
        }
    }
}
