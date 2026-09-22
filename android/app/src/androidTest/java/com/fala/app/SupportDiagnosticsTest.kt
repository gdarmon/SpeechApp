package com.fala.app

import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.fala.app.data.ConnectionSettings
import com.fala.app.voice.VoiceEvent
import com.fala.app.voice.VoiceOperation
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class SupportDiagnosticsTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun reportContainsOnlyAllowedDataAndSharedFileIsReadable() {
        val settings = ConnectionSettings(context)
        val prefs = context.getSharedPreferences("connection", 0)
        val previous = prefs.getString("active", null)
        prefs.edit().putString("active", "private-session-text-must-not-be-exported").commit()
        try {
            val diagnostics = SupportDiagnostics(context)
            diagnostics.events.record(VoiceEvent.RECOGNITION_ERROR, 13, operation = VoiceOperation.RECOGNITION_CALLBACK)
            val report = diagnostics.report(settings)
            assertTrue(report.contains("App: ${BuildConfig.VERSION_NAME}"))
            assertTrue(report.contains("RECOGNITION_CALLBACK code=13"))
            assertFalse(report.contains("private-session-text-must-not-be-exported"))
            val send = diagnostics.shareIntent(report)
            assertEquals(Intent.ACTION_SEND, send.action)
            assertEquals("text/plain", send.type)
            assertTrue(send.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
            @Suppress("DEPRECATION")
            val uri = requireNotNull(send.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))
            assertEquals("content", uri.scheme)
            assertEquals(uri, send.clipData?.getItemAt(0)?.uri)
            assertEquals(report, context.contentResolver.openInputStream(uri)!!.bufferedReader().use { it.readText() })
            val provider = context.packageManager.resolveContentProvider("${BuildConfig.APPLICATION_ID}.support-files", 0)!!
            assertFalse(provider.exported)
            assertTrue(provider.grantUriPermissions)
        } finally {
            if (previous == null) prefs.edit().remove("active").commit() else prefs.edit().putString("active", previous).commit()
        }
    }

    @Test fun otherCacheFilesCannotBeSharedThroughSupportProvider() {
        val privateFile = File(context.cacheDir, "private-not-a-report.txt").apply { writeText("private") }
        try {
            assertThrows(IllegalArgumentException::class.java) {
                FileProvider.getUriForFile(context, "${BuildConfig.APPLICATION_ID}.support-files", privateFile)
            }
        } finally { privateFile.delete() }
    }
}
