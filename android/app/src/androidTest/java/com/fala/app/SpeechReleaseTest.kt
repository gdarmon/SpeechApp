package com.fala.app

import android.app.Application
import android.os.SystemClock
import androidx.compose.runtime.MutableState
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.fala.app.data.ConnectionSettings
import com.fala.app.voice.Heard
import com.fala.app.voice.SpeechFailure
import com.fala.app.voice.SpeechInput
import com.fala.app.voice.SpeechOutput
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SpeechReleaseTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private fun main(action: () -> Unit) = instrumentation.runOnMainSync(action)

    private class Input : SpeechInput {
        var stops = 0
        var cancelled = 0
        var starts = 0
        var autoReady = true
        var onStop: () -> Unit = {}
        lateinit var partial: (String) -> Unit
        lateinit var result: (Heard) -> Unit
        lateinit var error: (SpeechFailure) -> Unit
        override fun listen(language: String, allowNetwork: Boolean, ready: () -> Unit,
            level: (Float) -> Unit, partial: (String) -> Unit, result: (Heard) -> Unit, error: (SpeechFailure) -> Unit) {
            starts++; this.partial = partial; this.result = result; this.error = error
            if (autoReady) ready()
        }
        override fun finish() { stops++; onStop() }
        override fun cancel() { cancelled++ }
        override fun close() = cancel()
    }

    private fun withController(test: (SessionController, Input) -> Unit) {
        lateinit var c: SessionController
        val input = Input()
        main {
            val app = ApplicationProvider.getApplicationContext<Application>()
            ConnectionSettings(app).clearSession()
            c = SessionController(app)
            SessionController::class.java.getDeclaredField("input").apply { isAccessible = true }.let {
                (it.get(c) as SpeechInput).close(); it.set(c, input)
            }
            @Suppress("UNCHECKED_CAST")
            val screen = SessionController::class.java.getDeclaredField("screen\$delegate").apply { isAccessible = true }.get(c) as MutableState<String>
            screen.value = "talk"
            c.setForeground(true)
        }
        try { test(c, input) } finally {
            main {
                c.setForeground(false)
                (SessionController::class.java.getDeclaredField("output").apply { isAccessible = true }.get(c) as SpeechOutput).close()
            }
        }
    }

    @Test fun releaseKeepsTheLastWordsAndWaitsForTheFinalResult() = withController { c, input ->
        main {
            c.beginHolding()
            input.partial("Sim, por")
            c.finishHolding()
            c.finishHolding() // A duplicate release must not shorten or extend the tail.
            assertFalse(c.holding)
            assertTrue(c.finishingSpeech)
            assertTrue(c.recording)
            assertEquals(0, input.stops)
            c.beginHolding(); c.sendDraft()
            assertEquals(1, input.starts)
            assertFalse(c.busy)
            input.partial("Sim, por favor")
            assertEquals("Sim, por favor", c.partialWords)
        }
        SystemClock.sleep(1300)
        main {
            assertEquals(1, input.stops)
            assertEquals("Recognizing", c.phase)
            assertTrue(c.recording)
            input.result(Heard("Sim, por favor.", 1500))
            assertEquals("Sim, por favor.", c.draft.text)
            assertEquals("speech", c.draft.source)
            assertFalse(c.recording)
            assertEquals(0, c.completedTurns)
        }
    }

    @Test fun aNaturalResultDuringTheTailCancelsTheDelayedStop() = withController { c, input ->
        main {
            c.beginHolding(); c.finishHolding()
            input.result(Heard("Tudo bem.", 1000))
            assertFalse(c.recording)
        }
        SystemClock.sleep(1300)
        main { assertEquals(0, input.stops); assertEquals("Tudo bem.", c.draft.text) }
    }

    @Test fun backgroundingCancelsTheTailAndStaleCallbacksCannotAffectTheNextHold() = withController { c, input ->
        main {
            c.beginHolding(); c.finishHolding()
            val staleResult = input.result
            val before = input.cancelled
            c.setForeground(false)
            assertTrue(input.cancelled > before)
            assertFalse(c.recording)
            c.setForeground(true); c.beginHolding()
            staleResult(Heard("Old words", 1000))
            assertEquals("", c.draft.text)
        }
        SystemClock.sleep(1300)
        main { assertEquals(0, input.stops); assertTrue(c.holding); assertEquals(2, input.starts) }
    }

    @Test fun releaseBeforeReadinessAndCancelledGesturesStopImmediately() = withController { c, input ->
        main {
            input.autoReady = false
            c.beginHolding(); val before = input.cancelled; c.finishHolding()
            assertTrue(input.cancelled > before)
            assertFalse(c.recording)
            input.autoReady = true
            c.beginHolding(); c.cancelHolding()
            assertFalse(c.recording)
        }
        SystemClock.sleep(1300)
        main { assertEquals(0, input.stops) }
    }

    @Test fun speechFailureDuringTheTailStopsImmediatelyAndKeepsReviewableWords() = withController { c, input ->
        main {
            c.beginHolding(); c.finishHolding()
            input.partial("Eu quero")
            input.error(SpeechFailure(2))
            assertFalse(c.recording)
            assertTrue(c.voiceTrouble)
            assertEquals("Eu quero", c.draft.text)
        }
        SystemClock.sleep(1300)
        main { assertEquals(0, input.stops) }
    }

    @Test fun safetyCutoffStopsWithoutATailAndAcceptsASynchronousResult() = withController { c, input ->
        main {
            input.onStop = { input.result(Heard("Fim.", 45000)) }
            c.beginHolding(); c.finishHolding(immediate = true)
            assertEquals(1, input.stops)
            assertFalse(c.recording)
            assertEquals("Fim.", c.draft.text)
        }
    }
}
