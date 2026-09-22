package com.fala.app

import android.app.Activity
import android.content.Context
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.fala.app.data.ConnectionSettings
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability

/** Optional Play updates. Never infer availability from the server's or another track's version. */
internal class AppUpdates(context: Context, private val settings: ConnectionSettings,
                          private val launcher: ActivityResultLauncher<IntentSenderRequest>,
                          private val safeToInterrupt: () -> Boolean) {
    private val manager = AppUpdateManagerFactory.create(context.applicationContext)
    var offer by mutableStateOf(UpdateOffer())
        private set
    var pending by mutableStateOf(false)
        private set
    var failed by mutableStateOf(false)
        private set
    private var dismissedVersion by mutableStateOf(settings.dismissedUpdateVersion)
    private var remindAfter by mutableStateOf(settings.updateReminderAfter)
    private var checkedAt by mutableStateOf(System.currentTimeMillis())
    private var foreground = false
    private var generation = 0
    private var disposed = false
    private val listener = InstallStateUpdatedListener { state ->
        // A listener event is newer than any outstanding availability query.
        generation++
        pending = false
        if (offer.version <= BuildConfig.VERSION_CODE) {
            refresh()
            return@InstallStateUpdatedListener
        }
        when (state.installStatus()) {
            InstallStatus.PENDING, InstallStatus.DOWNLOADING -> offer = offer.copy(stage = UpdateStage.DOWNLOADING)
            InstallStatus.DOWNLOADED -> offer = offer.copy(stage = UpdateStage.READY)
            InstallStatus.INSTALLED -> offer = UpdateOffer()
            InstallStatus.FAILED -> { failed = true; pending = false; offer = offer.copy(stage = UpdateStage.AVAILABLE) }
            InstallStatus.CANCELED -> { pending = false; offer = offer.copy(stage = UpdateStage.AVAILABLE); later() }
        }
    }

    init { manager.registerListener(listener) }

    fun resume() { foreground = true; checkedAt = System.currentTimeMillis(); refresh() }
    fun pause() { foreground = false }
    fun close() { disposed = true; generation++; manager.unregisterListener(listener) }

    fun visible(screen: String, busy: Boolean): Boolean =
        offer.visible(screen, busy, dismissedVersion, remindAfter, checkedAt)

    private fun snapshot(info: AppUpdateInfo) = UpdateOffer.fromPlay(
        installed = BuildConfig.VERSION_CODE, available = info.availableVersionCode(),
        updateAvailable = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE,
        flexibleAllowed = info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE),
        downloading = info.installStatus() in listOf(InstallStatus.PENDING, InstallStatus.DOWNLOADING),
        downloaded = info.installStatus() == InstallStatus.DOWNLOADED)

    private fun refresh() {
        if (pending) return
        val request = ++generation
        manager.appUpdateInfo.addOnSuccessListener { info ->
            if (!disposed && request == generation) offer = snapshot(info)
        }.addOnFailureListener {
            // Offline, sideloaded or unavailable Play services must never block practice.
        }
    }

    fun later() {
        dismissedVersion = offer.version
        remindAfter = System.currentTimeMillis() + UpdateOffer.REMIND_AFTER_MILLIS
        settings.postponeUpdate(dismissedVersion, remindAfter)
        failed = false
    }

    fun onResult(resultCode: Int) {
        pending = false
        if (resultCode == Activity.RESULT_CANCELED) later()
        else if (resultCode != Activity.RESULT_OK) failed = true
        refresh()
    }

    fun update() {
        if (pending || !foreground || !safeToInterrupt()) return
        // AppUpdateInfo is single-use. Recheck immediately before every explicit attempt.
        val requestedStage = offer.stage
        if (requestedStage !in listOf(UpdateStage.AVAILABLE, UpdateStage.READY)) return
        pending = true
        failed = false
        val request = ++generation
        manager.appUpdateInfo.addOnSuccessListener { info ->
            if (disposed || request != generation) { pending = false; return@addOnSuccessListener }
            offer = snapshot(info)
            if (!foreground || !safeToInterrupt()) { pending = false; return@addOnSuccessListener }
            if (requestedStage == UpdateStage.READY && offer.stage == UpdateStage.READY) {
                manager.completeUpdate().addOnSuccessListener { pending = false }
                    .addOnFailureListener { pending = false; failed = true }
            } else if (requestedStage == UpdateStage.AVAILABLE && offer.stage == UpdateStage.AVAILABLE) {
                val started = runCatching { manager.startUpdateFlowForResult(info, launcher,
                    AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build()) }.getOrDefault(false)
                pending = false
                if (!started) failed = true
            } else pending = false
        }.addOnFailureListener { pending = false; if (!disposed) failed = true }
    }
}
