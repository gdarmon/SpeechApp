# Android microphone support

Fala 0.13.1 adds **Microphone help & share a report** in Settings and conversation options. Speech errors link directly to the same help. The first-use guide explains permission, holding until Listening, and the optional network-recognition setting; existing accounts can replay it from Settings. Network recognition stays off unless the learner chooses it.

The help screen offers permission checks, app permissions, phone speech-recognition settings and voice-playback settings. A denied microphone request explains how to grant access or continue typing. Checking permission never starts listening. Granting permission in Android settings clears the obsolete missing-permission message when Fala returns to the foreground.

## Diagnosing a report

Ask the learner to reproduce the problem, then open Microphone help, preview the report and share it with fala.support@gmail.com. They choose a destination in Android's share sheet; Fala never uploads the report automatically.

Reports contain app/build, device model, Android version/build, current microphone permission/mute status, the chosen recognition mode, speech-service component names and up to 80 timestamped events from the current app process. Logs accept only enum events/operations, numeric codes, boolean network choice and three allowed language tags. There are no transcripts, audio, free-form exception messages, URLs, account identifiers, tokens or general installed-app inventories.

Follow the event sequence: permission request/check, hold, recognizer creation, startListening, ready, speech and result/error. Recognition callbacks preserve Android's numeric error code. An operation field identifies the failing API step; it cannot reveal a provider's undisclosed internal cause. The report includes a code legend. Fala's negative recognition codes distinguish missing local/default service, exceptions, startup timeout and result timeout. API errors include only an HTTP status when available.

Events are held in memory and cleared on sign-out. Export uses a content URI scoped to the support-reports cache directory, with a temporary read grant. At export, retain at most four earlier files and remove files older than 24 hours before creating the new one. Sign-out removes cached reports. Copies already shared elsewhere remain with the chosen recipient/service.

The POCO M6 Pro / Android 16 report was a microphone service stopping during Getting ready. The tester later reported that it worked. No device error code was captured, so the root cause is unconfirmed. Do not assume every startup failure is a missing permission or silently turn on network recognition.

## Verification

- JVM tests cover bounded/cleared logs, exclusion of free-form text, distinct permission/service failure codes and actionable English/Hebrew advice.
- Android instrumentation tests cover report content and FileProvider scope/read grants. The existing first-use-guide test also enters microphone help and returns to the same guide step without starting recording.
- For device validation, deny permission, reopen help, grant from Android settings and retry. Test network recognition both off and on, missing language/service, early release, app backgrounding and successful result editing. Check report preview/share in an installed mail or messaging app.
- A Play Store installation failure occurs before Fala runs and cannot be captured by this report. Verify tester opt-in/account and troubleshoot the Play Store separately.
