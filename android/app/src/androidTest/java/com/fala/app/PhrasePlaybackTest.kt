package com.fala.app

import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.fala.app.data.ConnectionSettings
import com.fala.app.voice.SpeechOutput
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PhrasePlaybackTest {
    @Test fun phraseSpeedOverridesSlowQuestionWithoutEditingOrSendingAnAnswer() {
        ConnectionSettings(InstrumentationRegistry.getInstrumentation().targetContext).clearSession()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val c = ViewModelProvider(activity)[SessionController::class.java]
                val played = mutableListOf<Pair<String, Boolean>>()
                val output = SessionController::class.java.getDeclaredField("output").apply { isAccessible = true }
                (output.get(c) as SpeechOutput).close()
                output.set(c, object : SpeechOutput {
                    override fun speak(text: String, slow: Boolean, done: () -> Unit, error: (String) -> Unit) {
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
