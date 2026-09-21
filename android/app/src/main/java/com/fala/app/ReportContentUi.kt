package com.fala.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable fun ReportContentAction(c: SessionController, summary: Boolean = false) {
    var open by remember { mutableStateOf(false) }
    var sent by remember { mutableStateOf(false) }
    var category by remember { mutableStateOf("inappropriate") }
    var note by remember { mutableStateOf("") }
    TextButton(onClick = { sent=false;note="";open=true;c.pause() }, enabled = !c.busy && !c.recording) { Text(if (summary) "Report this AI review" else "Report this AI reply") }
    if (open) AlertDialog(onDismissRequest = { if (!c.busy) open=false }, title = { Text(if (sent) "Report received" else "Report AI content") }, text = {
        if (sent) Text("Thank you. Your report has been sent to Fala for review.")
        else Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("The selected AI content and your note will be sent to Fala for review. Please leave out personal details.")
            listOf("inappropriate" to "Inappropriate or offensive", "unsafe" to "Unsafe advice", "inaccurate" to "Incorrect teaching", "other" to "Other concern").forEach { (value,label) ->
                FilterChip(selected=category==value,onClick={category=value},enabled=!c.busy,label={Text(label)})
            }
            OutlinedTextField(value=note,onValueChange={note=it.take(1000)},label={Text("Optional details")},enabled=!c.busy,modifier=Modifier.fillMaxWidth())
            if (c.error.isNotBlank()) Text(c.error,color=MaterialTheme.colorScheme.error)
        }
    }, confirmButton = {
        TextButton(onClick = { if (sent) open=false else c.submitContentReport(summary,category,note) { sent=true } }, enabled=!c.busy) { Text(if (sent) "Done" else if (c.busy) "Sending…" else "Send report") }
    }, dismissButton = { if (!sent) TextButton(onClick={open=false},enabled=!c.busy) {Text("Cancel")} })
}
