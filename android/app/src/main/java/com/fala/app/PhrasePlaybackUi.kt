package com.fala.app

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/** Each control plays the same phrase once, at the explicitly selected speed. */
@Composable
internal fun PhrasePlaybackControls(text: String, language: String, enabled: Boolean, play: (Boolean) -> Unit) {
    val he = language == "he-IL"
    Row(verticalAlignment = Alignment.CenterVertically) {
        listOf(false, true).forEach { slow ->
            val label = if (slow) { if (he) "איטי" else "Slow" } else { if (he) "רגיל" else "Normal" }
            val description = if (he) "השמעה ${if (slow) "איטית" else "רגילה"}: $text"
                else "${if (slow) "Listen slowly" else "Listen normally"} to $text"
            TextButton(onClick = { play(slow) }, enabled = enabled,
                modifier = Modifier.widthIn(min = 48.dp).heightIn(min = 56.dp).semantics { contentDescription = description },
                contentPadding = PaddingValues(horizontal = 4.dp, vertical = 4.dp)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Icon(painterResource(if (slow) R.drawable.ic_play_slow else R.drawable.ic_play), null, Modifier.size(22.dp))
                    Text(label, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}
