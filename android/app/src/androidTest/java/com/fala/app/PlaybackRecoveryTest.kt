package com.fala.app

import android.graphics.Bitmap
import android.view.accessibility.AccessibilityNodeInfo
import androidx.compose.runtime.MutableState
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import com.fala.app.data.ConnectionSettings
import java.io.File
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.fala.app.voice.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PlaybackRecoveryTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private fun main(action: () -> Unit) { instrumentation.runOnMainSync(action); instrumentation.waitForIdleSync() }
    private class Engine(val events: PlaybackEvents, val available: List<PlaybackVoice>) : PlaybackEngine {
        val calls = mutableListOf<Triple<String, String, Boolean>>()
        var selected = ""
        var closed = false
        override fun voices() = available
        override fun defaultVoice() = "default"
        override fun select(name: String): Int { selected = name; return 0 }
        override fun speak(text: String, slow: Boolean, id: String): Int { calls.add(Triple(id, selected, slow)); return 0 }
        override fun stop() {}
        override fun close() { closed = true }
    }
    private val voices = listOf(
        PlaybackVoice("missing", "pt", "BR", false, false),
        PlaybackVoice("default", "pt", "BR", false, true),
        PlaybackVoice("fallback", "pt", "BR", false, true),
        PlaybackVoice("network", "pt", "BR", true, true))

    @Test fun brokenInstalledVoiceRetriesAndLateVendorCallbacksCannotFinishTheNewUtterance() {
        lateinit var engine: Engine
        lateinit var output: AndroidSpeechOutput
        val failures = mutableListOf<PlaybackFailure>()
        var done = 0
        main { output = AndroidSpeechOutput(VoiceLog()) { events -> Engine(events, voices).also { engine = it; events.initialized(0) } } }
        try {
            main { output.speak("Olá", true, { done++ }, failures::add) }
            val first = engine.calls.single().first
            assertEquals("default", engine.calls.single().second)
            main { engine.events.failed(first, -3) }
            assertEquals(listOf("default", "fallback"), engine.calls.map { it.second })
            assertTrue(engine.calls.all { it.third })
            val second = engine.calls.last().first
            main { engine.events.finished(first); engine.events.failed(first, -9) }
            assertEquals(0, done); assertTrue(failures.isEmpty())
            main { engine.events.finished(second) }
            assertEquals(1, done); assertTrue(failures.isEmpty())
        } finally { main { output.close() } }
    }
    @Test fun exhaustedOfflineVoicesNeverSwitchToNetworkAndExplicitRetryIsPossible() {
        lateinit var engine: Engine
        lateinit var output: AndroidSpeechOutput
        val failures = mutableListOf<PlaybackFailure>()
        main { output = AndroidSpeechOutput(VoiceLog()) { events -> Engine(events, voices).also { engine = it; events.initialized(0) } } }
        try {
            main { output.speak("Olá", false, {}, failures::add) }
            main { engine.events.failed(engine.calls.last().first, -9) }
            main { engine.events.failed(engine.calls.last().first, -3) }
            assertEquals(2, engine.calls.size); assertEquals(-3, failures.single().code)
            main { output.speak("Olá", false, {}, failures::add) }
            assertEquals(3, engine.calls.size)
        } finally { main { output.close() } }
    }
    @Test fun noReplayAfterAudioStartsAndStopDiscardsCallbacks() {
        lateinit var engine: Engine
        lateinit var output: AndroidSpeechOutput
        val failures = mutableListOf<PlaybackFailure>()
        var done = 0
        main { output = AndroidSpeechOutput(VoiceLog()) { events -> Engine(events, voices).also { engine = it; events.initialized(0) } } }
        try {
            main { output.speak("Olá", false, { done++ }, failures::add) }
            main { engine.events.started(engine.calls.last().first) }
            main { engine.events.failed(engine.calls.last().first, -3) }
            assertEquals(1, engine.calls.size); assertEquals(1, failures.size)
            main { output.speak("Outra frase", false, { done++ }, failures::add) }
            val id = engine.calls.last().first
            main { output.stop(); engine.events.finished(id); engine.events.failed(id, -9) }
            assertEquals(0, done); assertEquals(1, failures.size)
        } finally { main { output.close() } }
    }
    @Test fun refreshingLoadsNewVoiceDataAndIgnoresOldInitialization() {
        val engines = mutableListOf<Engine>()
        lateinit var output: AndroidSpeechOutput
        val failures = mutableListOf<PlaybackFailure>()
        main { output = AndroidSpeechOutput(VoiceLog()) { events -> Engine(events,
            if (engines.isEmpty()) voices.take(1) else voices).also { engines.add(it) } } }
        try {
            main { engines[0].events.initialized(0) }
            main { output.speak("Olá", false, {}, failures::add) }
            assertEquals(PlaybackFailure.MISSING_VOICE, failures.single().code)
            main { output.refresh(); output.speak("Olá", false, {}, failures::add) }
            assertTrue(engines[0].closed)
            main { engines[0].events.initialized(-1) }
            assertTrue(engines[1].calls.isEmpty())
            main { engines[1].events.initialized(0) }
            assertEquals("default", engines[1].calls.single().second)
        } finally { main { output.close() } }
    }
    @Test fun playbackFailureShowsPlaybackHelpWithoutRequestingMicrophonePermission() {
        ConnectionSettings(instrumentation.targetContext).clearSession()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val c = ViewModelProvider(activity)[SessionController::class.java]
                c.chooseSupportLanguage("he-IL")
                val field = SessionController::class.java.getDeclaredField("screen\$delegate").apply { isAccessible = true }
                @Suppress("UNCHECKED_CAST")
                (field.get(c) as MutableState<String>).value = "talk"
                c.reply.put("text", "Olá!").put("translation", "שלום!")
                val output = SessionController::class.java.getDeclaredField("output").apply { isAccessible = true }
                (output.get(c) as SpeechOutput).close()
                output.set(c, object : SpeechOutput {
                    override fun speak(text: String, slow: Boolean, done: () -> Unit, error: (PlaybackFailure) -> Unit) {
                        error(PlaybackFailure(-3))
                    }
                    override fun stop() {}
                    override fun close() {}
                })
                c.setForeground(true)
                c.listenTo("Olá!")
                assertTrue(c.playbackTrouble); assertFalse(c.voiceTrouble); assertFalse(c.recording)
                c.microphonePermissionResult(true)
                assertTrue(c.playbackTrouble); assertTrue(c.voiceNotice.contains("שירות ההקראה"))
                assertFalse(c.diagnostics.events.text().contains("MICROPHONE_PERMISSION_REQUEST"))
            }
            fun find(label: String, node: AccessibilityNodeInfo? = instrumentation.uiAutomation.rootInActiveWindow): AccessibilityNodeInfo? {
                if (node == null) return null
                if (node.text?.toString() == label) return node
                for (i in 0 until node.childCount) find(label, node.getChild(i))?.let { return it }
                return null
            }
            var button: AccessibilityNodeInfo? = null
            repeat(30) { if (button == null) { Thread.sleep(100); button = find("עזרת השמעה") } }
            var clickable = requireNotNull(button)
            assertNull(find("עזרת מיקרופון"))
            while (!clickable.isClickable) clickable = requireNotNull(clickable.parent)
            assertTrue(clickable.performAction(AccessibilityNodeInfo.ACTION_CLICK))
            instrumentation.waitForIdleSync(); Thread.sleep(600)
            assertNotNull(find("עזרת השמעה"))
            assertNull(find("1. הרשאת מיקרופון"))
            val directory = File(instrumentation.targetContext.getExternalFilesDir(null), "playback-help").apply { mkdirs() }
            val image = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
            File(directory, "he-playback-help.png").outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) }
            image.recycle()
        }
    }

}
