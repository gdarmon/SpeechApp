package com.fala.app

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

@Composable
internal fun UpdateCard(updates: AppUpdates, hebrew: Boolean) {
    fun label(he: String, en: String) = if (hebrew) he else en
    val ready = updates.offer.stage == UpdateStage.READY
    val downloading = updates.offer.stage == UpdateStage.DOWNLOADING
    CompositionLocalProvider(LocalLayoutDirection provides if (hebrew) LayoutDirection.Rtl else LayoutDirection.Ltr) {
        Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(when {
                    ready -> label("העדכון מוכן להתקנה", "Your update is ready")
                    downloading -> label("העדכון יורד ברקע", "Your update is downloading")
                    else -> label("יש גרסה חדשה של Fala", "A new version of Fala is available")
                }, style = MaterialTheme.typography.titleMedium)
                Text(when {
                    ready -> label("אפשר להתקין עכשיו. האפליקציה תיפתח מחדש וההתקדמות שלכם תישמר.",
                        "Install when you’re ready. Fala will restart and your saved progress will stay.")
                    downloading -> label("אפשר להמשיך לתרגל. נודיע כשהעדכון יהיה מוכן.",
                        "You can keep practising. We’ll let you know when it’s ready.")
                    else -> label("העדכון זמין עבורכם ב־Google Play. אפשר להוריד אותו ולהמשיך לתרגל.",
                        "An update is available for you on Google Play. Download it while you keep practising.")
                })
                if (updates.failed) Text(label("לא הצלחנו לעדכן כרגע. אפשר לנסות שוב מאוחר יותר.",
                    "We couldn’t update right now. You can try again later."))
                if (downloading || updates.pending) LinearProgressIndicator(Modifier.fillMaxWidth())
                if (!downloading) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = updates::update, enabled = !updates.pending) {
                        Text(if (ready) label("התקן והפעל מחדש", "Install and restart") else label("עדכן", "Update"))
                    }
                    TextButton(onClick = updates::later, enabled = !updates.pending) { Text(label("אחר כך", "Later")) }
                }
            }
        }
    }
}
