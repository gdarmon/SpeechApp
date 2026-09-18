# Physical device acceptance checks

These checks require a real Android device and a configured provider. They are not claimed as completed by a successful build or automated server tests.

1. Install the APK, connect to the server, consent to processing, grant microphone access.
2. Confirm the selected voice is Brazilian Portuguese (pt-BR); verify missing language packs show an actionable message.
3. Tap Talk. Hear the first question. Speak naturally. Continue ten exchanges without typing or manually restarting the microphone.
4. Verify at least five assessment answers can cover past events, plans, understanding a question, and an opinion. Finish and inspect seven separate dimensions; pronunciation must say unassessed.
5. Say “Eu tenho 44 anos.” Verify feedback does not correct it.
6. Ask for help in English, then Hebrew. Verify the phrase matches the intended meaning, is natural Brazilian Portuguese, and the microphone returns to Portuguese for your attempt.
7. Tap while the partner is speaking; playback should stop and recognition should begin without transcribing the partner's audio.
8. Stay silent; the app should pause with a retry action. Deny microphone permission; the app should explain how to enable it. Try an unavailable language pack.
9. Background the app, rotate the phone, and receive an incoming call during playback/listening. There must be no hidden recording or stale callback restarting audio. Explicitly resume when ready.
10. Disable network during an AI request, restore it, and tap Retry. Confirm no duplicated learner turns. Reopen the app and resume an unfinished session from history.
11. Finish with zero corrections when speech is natural. Inspect an intentionally repeated real construction error across two sessions; it should count twice, and appear naturally after its review date.
12. Delete one session and reopen the app: its transcript and contribution to mistake memory must disappear. Delete all: history, assessment, and memory must reset.
13. Try both loudspeaker and headphones; measure end-of-speech to first reply audio across Wi-Fi and mobile data. Record the actual median/tail latency and obvious recognition problems before choosing a new voice provider.

Release readiness also requires deployment/authentication hardening, retention/backups policy, and a release signing key. None of those require adding gamification or a larger UI.
