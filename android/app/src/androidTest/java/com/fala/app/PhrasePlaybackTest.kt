package com.fala.app

import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.fala.app.data.ConnectionSettings
import com.fala.app.voice.PlaybackFailure
import com.fala.app.voice.SpeechOutput
import com.fala.app.voice.AndroidSpeechOutput
import com.fala.app.voice.PlaybackEngine
import com.fala.app.voice.PlaybackVoice
import com.fala.app.voice.VoiceLog
import androidx.compose.runtime.MutableState
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PhrasePlaybackTest {
    @Test fun questionAndPhraseButtonsSendDifferentRatesEvenWhenTheLessonAlreadyRequestsSlowSpeech() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val rates = mutableListOf<Float>()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val c = ViewModelProvider(activity)[SessionController::class.java]
                val screen = SessionController::class.java.getDeclaredField("screen\$delegate").apply { isAccessible = true }
                @Suppress("UNCHECKED_CAST")
                (screen.get(c) as MutableState<String>).value = "talk"
                c.reply.put("text", "Você conhece a ginga?").put("pace", "slow")
                    .put("suggested_replies", JSONArray().put(JSONObject().put("text", "Sim, por favor.")))
                c.chooseSupportLanguage("en-US"); c.settings.showReplyIdeas = true; c.revealIdeas()
                val output = SessionController::class.java.getDeclaredField("output").apply { isAccessible = true }
                (output.get(c) as SpeechOutput).close()
                output.set(c, AndroidSpeechOutput(VoiceLog()) { events ->
                    events.initialized(0)
                    object : PlaybackEngine {
                        override fun voices() = listOf(PlaybackVoice("local", "pt", "BR", false, true))
                        override fun defaultVoice() = "local"
                        override fun select(name: String) = 0
                        override fun speak(text: String, rate: Float, id: String): Int {
                            rates.add(rate); events.started(id); events.finished(id); return 0
                        }
                        override fun stop() {}
                        override fun close() {}
                    }
                })
                c.setForeground(true)
            }
            fun find(label: String, node: AccessibilityNodeInfo? = instrumentation.uiAutomation.rootInActiveWindow): AccessibilityNodeInfo? {
                if (node == null) return null
                if (node.text?.toString() == label) return node
                for (i in 0 until node.childCount) find(label, node.getChild(i))?.let { return it }
                return null
            }
            for ((index, label) in listOf("Listen", "Slower", "Slower", "Listen", "Slow", "Normal").withIndex()) {
                instrumentation.waitForIdleSync(); Thread.sleep(250)
                var button: AccessibilityNodeInfo? = null
                repeat(20) { if (button == null) { button = find(label); Thread.sleep(100) } }
                var clickable = requireNotNull(button) { "Missing playback button $label" }
                while (!clickable.isClickable) clickable = requireNotNull(clickable.parent)
                assertTrue(clickable.performAction(AccessibilityNodeInfo.ACTION_CLICK))
                repeat(20) { instrumentation.waitForIdleSync(); if (rates.size <= index) Thread.sleep(100) }
            }
            assertEquals(listOf(1f, 0.7f, 0.7f, 1f, 0.7f, 1f), rates)
        }
    }
    @Test fun phraseSpeedOverridesSlowQuestionWithoutEditingOrSendingAnAnswer() {
        ConnectionSettings(InstrumentationRegistry.getInstrumentation().targetContext).clearSession()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val c = ViewModelProvider(activity)[SessionController::class.java]
                val played = mutableListOf<Pair<String, Boolean>>()
                val output = SessionController::class.java.getDeclaredField("output").apply { isAccessible = true }
                (output.get(c) as SpeechOutput).close()
                output.set(c, object : SpeechOutput {
                    override fun speak(text: String, slow: Boolean, done: () -> Unit, error: (PlaybackFailure) -> Unit) {
                        played.add(text to slow); done()
                    }
                    override fun stop() {}
                    override fun close() {}
                })
                c.setForeground(true)
                c.slow = true
                c.reply.put("pace", "slow")
                c.editDraft("My answer stays here")
                c.listenTo("Sim, por favor.", true)
                c.listenTo("Sim, por favor.", false)
                c.listenTo("Não, obrigado.", true)
                assertEquals(listOf("Sim, por favor." to true, "Sim, por favor." to false, "Não, obrigado." to true), played)
                assertEquals("My answer stays here", c.draft.text)
                assertEquals(0, c.completedTurns)
                assertTrue(c.slow) // Listening to a phrase does not change the partner preference.
                assertFalse(c.recording)
            }
        }
    }
}
