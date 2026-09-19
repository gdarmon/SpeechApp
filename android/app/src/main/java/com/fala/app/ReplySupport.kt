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
    "First phrases" to "A short phrase in your own words",
    "Full sentences" to "One full sentence with a detail",
    "Connected answers" to "Two connected sentences",
    "Explain and clarify" to "About three sentences",
    "Flexible conversations" to "Three or more connected sentences"
)
