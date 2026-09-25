package com.fala.app

// Once an answer idea has been exposed, hiding it cannot make this answer unaided.
internal data class ReplySupport(val textVisible: Boolean, val ideasVisible: Boolean, val usedIdeas: Boolean) {
    fun revealText() = copy(textVisible = true)
    fun revealIdeas() = copy(textVisible = true, ideasVisible = true, usedIdeas = true)
    fun hideIdeas() = copy(ideasVisible = false)

    companion object {
        fun start(listenFirst: Boolean, showIdeas: Boolean, helped: Boolean = false): ReplySupport {
            val visible = showIdeas && !listenFirst
            return ReplySupport(!listenFirst, visible, visible || helped)
        }
    }
}

internal val practiceLevels = listOf(
    "First phrases" to "A word or short phrase; reuse familiar patterns",
    "Simple sentences" to "One simple sentence with a useful detail",
    "Connected ideas" to "Two ideas linked with because, then or but",
    "Explain and clarify" to "Explain one point; add detail only when useful",
    "Flexible conversations" to "Explain a choice or offer an alternative"
)
