package com.fala.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.compose.ui.platform.LocalView

internal data class WalkthroughAnchor(val bounds: Rect, val requester: BringIntoViewRequester)
internal val LocalWalkthroughTargets = staticCompositionLocalOf<MutableMap<Int, WalkthroughAnchor>?> { null }

internal fun Modifier.walkthroughTarget(step: Int): Modifier = composed {
    val targets = LocalWalkthroughTargets.current
    val requester = remember { BringIntoViewRequester() }
    DisposableEffect(targets, step) {
        onDispose { if (targets?.get(step)?.requester === requester) targets.remove(step) }
    }
    this.bringIntoViewRequester(requester).onGloballyPositioned {
        targets?.set(step, WalkthroughAnchor(it.boundsInWindow(), requester))
    }
}

internal fun walkthroughCopy(hebrew: Boolean): List<Pair<String, String>> = if (hebrew) listOf(
    "מתחילים בהקשבה" to "לחצו על Listen כדי לשמוע את השאלה בפורטוגזית. Slower משמיע לאט יותר. אפשר להציג גם את המילים והתרגום.",
    "מוצאים מילים לתשובה" to "צריכים עזרה? פתחו את הרעיונות לתשובה. לחיצה על רעיון מעתיקה אותו לעריכה, וכפתור הניגון משמיע אותו.",
    "לוחצים, מדברים, משחררים" to "החזיקו את כפתור המיקרופון, חכו שיופיע Listening ודברו. סיימתם? שחררו. אפשר גם להקליד.",
    "בודקים ורק אז שולחים" to "המילים שלכם יופיעו כאן. אפשר לתקן אותן ואז ללחוץ על חץ השליחה. הדיבור לא שולח תשובה אוטומטית.",
    "תשובה אחת בכל פעם" to "אחרי 10 תשובות תקבלו משוב ומילים לחזרה. אין צורך למהר. אפשר לפתוח את ההדרכה שוב בהגדרות."
) else listOf(
    "Listen to the question" to "Tap Listen to hear the Portuguese. Slower gives you more time. You can reveal the words and translation too.",
    "Find your first words" to "Open Ideas for your reply when you need help. Tap an idea to copy it, or its play button to hear it. You can change the words.",
    "Hold, speak, release" to "Hold the microphone, wait for Listening, then speak. Release when you finish. Prefer typing? That works too.",
    "Check, then send" to "Your words appear here first. Edit them if needed, then tap the send arrow. Speaking never sends an answer automatically.",
    "One reply at a time" to "After 10 replies, review your feedback and useful words. Take your time. You can reopen this guide in Settings."
)

@Composable
internal fun Walkthrough(c: SessionController, targets: Map<Int, WalkthroughAnchor>) {
    val step = c.walkthroughStep ?: return
    val anchor = targets[step]
    LaunchedEffect(step, anchor?.requester) { anchor?.requester?.bringIntoView() }
    val hebrew = c.conversationLanguage == "he-IL"
    val copy = walkthroughCopy(hebrew)
    Dialog(onDismissRequest = c::closeWalkthrough,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false, dismissOnClickOutside = false)) {
        val view = LocalView.current
        SideEffect { (view.parent as? DialogWindowProvider)?.window?.setDimAmount(0f) }
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val heightPx = with(LocalDensity.current) { maxHeight.toPx() }
            Canvas(Modifier.fillMaxSize()) {
                val rect = anchor?.bounds?.inflate(4.dp.toPx())
                val mask = Path().apply {
                    fillType = PathFillType.EvenOdd
                    addRect(Rect(0f, 0f, size.width, size.height))
                    if (rect != null) addRoundRect(RoundRect(rect, CornerRadius(14.dp.toPx())))
                }
                drawPath(mask, Color(0xB8071E19))
                if (rect != null) drawRoundRect(Color(0xFFE6BE67), rect.topLeft, rect.size,
                    CornerRadius(14.dp.toPx()), style = Stroke(3.dp.toPx()))
            }
            val top = (anchor?.bounds?.center?.y ?: 0f) > heightPx / 2
            val cardMaxHeight = maxHeight * 0.52f
            Box(Modifier.fillMaxSize().safeDrawingPadding().padding(12.dp),
                contentAlignment = if (top) Alignment.TopCenter else Alignment.BottomCenter) {
                CompositionLocalProvider(LocalLayoutDirection provides if (hebrew) LayoutDirection.Rtl else LayoutDirection.Ltr) {
                    Surface(Modifier.widthIn(max = 420.dp).fillMaxWidth().heightIn(max = cardMaxHeight)
                        .semantics { paneTitle = copy[step].first; liveRegion = LiveRegionMode.Polite },
                        shape = RoundedCornerShape(22.dp), shadowElevation = 12.dp) {
                        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("${step + 1} / ${copy.size}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                                TextButton(onClick = c::closeWalkthrough) { Text(if (hebrew) "דלגו על ההדרכה" else "Skip tour") }
                            }
                            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(copy[step].first, style = MaterialTheme.typography.titleLarge)
                                Text(copy[step].second.replace("10", c.targetTurns.toString()), style = MaterialTheme.typography.bodyMedium)
                            }
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                if (step > 0) TextButton(onClick = c::previousWalkthroughStep) { Text(if (hebrew) "הקודם" else "Back") }
                                Button(onClick = c::nextWalkthroughStep) {
                                    Text(if (step == copy.lastIndex) { if (hebrew) "בואו נתחיל" else "Let’s try it" } else { if (hebrew) "הבא" else "Next" })
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
