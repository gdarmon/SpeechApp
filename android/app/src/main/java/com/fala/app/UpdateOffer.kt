package com.fala.app

internal enum class UpdateStage { NONE, AVAILABLE, DOWNLOADING, READY }

internal data class UpdateOffer(val version: Int = 0, val stage: UpdateStage = UpdateStage.NONE) {
    fun visible(screen: String, busy: Boolean, dismissedVersion: Int, remindAfter: Long, now: Long): Boolean =
        screen in listOf("home", "settings") && !busy && stage != UpdateStage.NONE &&
            (stage == UpdateStage.DOWNLOADING || version != dismissedVersion || now >= remindAfter)

    companion object {
        const val REMIND_AFTER_MILLIS = 24 * 60 * 60 * 1000L

        fun fromPlay(installed: Int, available: Int, updateAvailable: Boolean, flexibleAllowed: Boolean,
                     downloading: Boolean, downloaded: Boolean): UpdateOffer {
            if (available <= installed) return UpdateOffer()
            // Play may no longer offer a new flow while an accepted update is already downloading.
            val stage = when {
                downloaded -> UpdateStage.READY
                downloading -> UpdateStage.DOWNLOADING
                updateAvailable && flexibleAllowed -> UpdateStage.AVAILABLE
                else -> UpdateStage.NONE
            }
            return UpdateOffer(available, stage)
        }
    }
}
