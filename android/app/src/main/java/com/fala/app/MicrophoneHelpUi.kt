package com.fala.app

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

@Composable
internal fun MicrophoneHelp(c: SessionController, mic: (() -> Unit) -> Unit, appSettings: () -> Unit,
    voiceSettings: () -> Unit, close: () -> Unit) {
    val context = LocalContext.current
    val he = (if (c.screen == "talk") c.conversationLanguage else c.supportLanguage) == "he-IL"
    fun words(hebrew: String, english: String) = if (he) hebrew else english
    var allowed by remember { mutableStateOf(c.diagnostics.microphoneAllowed()) }
    var preview by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf("") }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) { allowed = c.diagnostics.microphoneAllowed(); preview = null }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    CompositionLocalProvider(LocalLayoutDirection provides if (he) LayoutDirection.Rtl else LayoutDirection.Ltr) {
        AlertDialog(onDismissRequest = close, title = { Text(words("עזרת מיקרופון", "Microphone help")) }, text = {
            Column(Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (c.voiceTrouble && c.voiceNotice.isNotBlank()) Text(c.voiceNotice)
                Text(words("1. הרשאת מיקרופון", "1. Microphone permission"), style = MaterialTheme.typography.titleSmall)
                Text(if (allowed) words("ההרשאה מאושרת. החזיקו את הכפתור, המתינו ל־Listening ודברו. שחררו ובדקו את המילים לפני השליחה.",
                    "Permission is allowed. Hold the button, wait for Listening and speak. Release and check your words before sending.")
                    else words("לשימוש בקול צריך לאפשר גישה למיקרופון. אפשר להמשיך בהקלדה גם בלי הרשאה.",
                        "Speaking needs microphone access. You can keep typing without granting it."))
                if (!allowed) OutlinedButton(onClick = { mic { allowed = c.diagnostics.microphoneAllowed() } }) {
                    Text(words("בקשת הרשאה למיקרופון", "Allow microphone access"))
                }
                Text(words("אם ההרשאה חסומה: פתחו הגדרות ← הרשאות ← מיקרופון ← אפשר בזמן השימוש. בדקו גם שגישה למיקרופון מופעלת בהגדרות הפרטיות של המכשיר.",
                    "If access is blocked: open app settings → Permissions → Microphone → Allow while using the app. Also check that microphone access is on in your phone’s privacy settings."))
                TextButton(onClick = appSettings) { Text(words("פתיחת הרשאות Fala", "Open Fala permissions")) }
                Text(words("2. זיהוי הדיבור במכשיר", "2. Your phone’s speech recognition"), style = MaterialTheme.typography.titleSmall)
                Text(words("בחלק מהמכשירים זיהוי דיבור מקומי אינו זמין, או שחסרה השפה. במקרה כזה אפשר לבחור זיהוי דרך האינטרנט ולנסות שוב עם חיבור פעיל.",
                    "Some phones cannot recognize speech on-device, or lack the language. You can choose network recognition and try again with an internet connection."))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(c.networkRecognition, { c.chooseNetworkRecognition(it); preview = null })
                    Text(words("זיהוי דיבור דרך האינטרנט", "Use network speech recognition"), Modifier.padding(start = 8.dp).weight(1f))
                }
                Text(words("כשהאפשרות מופעלת, ספק זיהוי הדיבור של המכשיר עשוי לקבל את הקול שלכם.",
                    "When enabled, your phone’s speech provider may receive your audio."), style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = {
                    runCatching { context.startActivity(Intent(Settings.ACTION_VOICE_INPUT_SETTINGS)) }
                        .recoverCatching { context.startActivity(Intent(Settings.ACTION_SETTINGS)) }
                        .onFailure { notice = words("פתחו את הגדרות המכשיר וחפשו זיהוי דיבור.", "Open your phone’s settings and search for speech recognition.") }
                }) { Text(words("הגדרות זיהוי דיבור במכשיר", "Phone speech recognition settings")) }
                TextButton(onClick = voiceSettings) { Text(words("אין קול בהשמעה? הגדרות הקראה", "No playback sound? Voice settings")) }
                HorizontalDivider()
                Text(words("עדיין יש תקלה?", "Still having trouble?"), style = MaterialTheme.typography.titleSmall)
                Text(words("נסו לשחזר את התקלה ואז שתפו דוח עם התמיכה ב־fala.support@gmail.com. הדוח כולל דגם, גרסאות, מצב הרשאות ושלבי תקלה — בלי הקלטות, תוכן שיחות או פרטי כניסה. אתם בוחרים למי לשלוח; דבר לא נשלח אוטומטית.",
                    "Try the failing action again, then share a report with fala.support@gmail.com. It includes device model, versions, permission status and error steps, without recordings, conversations or sign-in details. You choose who receives it; nothing is sent automatically."))
                TextButton(onClick = {
                    if (preview != null) preview = null else runCatching { c.diagnostics.report(c.settings) }
                        .onSuccess { preview = it }.onFailure { notice = words("לא ניתן להכין דוח כרגע. נסו שוב.", "Could not prepare a report. Please try again.") }
                }) { Text(if (preview == null) words("הצגת הדוח לפני שיתוף", "Preview report") else words("הסתרת הדוח", "Hide report")) }
                preview?.let { report ->
                    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                        SelectionContainer { Text(report, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall) }
                    }
                }
                Button(onClick = {
                    runCatching {
                        val intent = c.diagnostics.shareIntent(c.diagnostics.report(c.settings))
                        context.startActivity(Intent.createChooser(intent, words("שיתוף דוח תקלה של Fala", "Share Fala diagnostic report")))
                    }.onFailure { notice = words("לא ניתן לפתוח את השיתוף. אפשר להציג את הדוח, להעתיק אותו ולשלוח לתמיכה.",
                        "Could not open sharing. Preview the report, copy it and send it to support.") }
                }) { Text(words("שיתוף דוח תקלה", "Share diagnostic report")) }
                if (notice.isNotBlank()) Text(notice)
            }
        }, confirmButton = { TextButton(onClick = close) { Text(words("חזרה", "Back")) } })
    }
}
