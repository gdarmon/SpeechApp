package com.fala.app.voice

data class ReplyDraft(
    val text: String = "",
    val source: String = "typed",
    val speechMs: Long = 0,
    val assisted: Boolean = false,
) {
    fun edited(value: String) = copy(text = value.take(2500), source = "typed", speechMs = 0)
    fun segment(value: String, duration: Long) = copy(
        text = listOf(text.trim(), value.trim()).filter { it.isNotEmpty() }.joinToString(" ").take(2500),
        source = "speech",
        speechMs = (speechMs + duration.coerceAtLeast(0)).coerceAtMost(180000),
    )
}
