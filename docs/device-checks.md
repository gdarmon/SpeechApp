# Physical device acceptance checks

These checks require a real Android device and a configured provider. They are not claimed as completed by a successful build or automated server tests.

1. Install the app, choose English or Hebrew once, consent to processing, and sign in with Google. An existing signed-in user should see the language choice once after updating. Restart: the choice is remembered; Settings can change it for new sessions.
2. Confirm the selected voice is Brazilian Portuguese (pt-BR); verify missing language packs show an actionable message.
3. Tap Talk. Hear and read the first Portuguese question with its translation and two translated reply ideas. The microphone must stay closed after playback. Hold to speak, wait for Listening, speak, and release. Review the recognized words and tap Send. Continue ten exchanges. Pause briefly within a held answer and verify the segments form one draft. Do not send anything automatically.
4. Verify at least five unaided spoken assessment answers can cover past events, plans, understanding a question, and an opinion. Finish and inspect seven separate dimensions; pronunciation must say unassessed.
5. Say “Eu tenho 44 anos.” Verify feedback does not correct it.
6. Test separate conversations with English and Hebrew support. Verify faithful question and suggestion translations, readable Hebrew right-to-left layout, and Portuguese left-to-right layout. Tap an idea, edit it, and send; then speak one yourself. Guided/typed answers must not produce an unaided speaking estimate. Ask for help in the selected language; after Send the composer returns to Portuguese.
7. Hold while the partner is speaking; playback should stop and recognition should begin without transcribing the partner’s audio. Release before microphone startup, drag out of the button, and use keyboard/TalkBack controls. No capture should start after a released press, including after a delayed permission grant.
8. Stay silent: a message by the composer should offer holding again or typing. Deny microphone permission; the app should explain how to enable it while typing still works. Try an unavailable language pack and explicitly enabled network recognition. Verify a low-confidence nonblank transcript remains editable. Release and confirm the app never remains stuck on Finishing.
9. Background the app, rotate the phone, and receive an incoming call during playback/listening. There must be no hidden recording or stale callback restarting audio. Explicitly resume when ready.
10. Disable network during an AI request, restore it, and tap Retry. Confirm no duplicated learner turns. Reopen the app and resume an unfinished session from history.
11. Finish with zero corrections when speech is natural. Inspect an intentionally repeated real construction error across two sessions; it should count twice, and appear naturally after its review date.
12. Delete one session and reopen the app: its transcript and contribution to mistake memory must disappear. Delete all: history, assessment, and memory must reset.
13. Try both loudspeaker and headphones; measure Send to first reply audio across Wi-Fi and mobile data. Record the actual median/tail latency and obvious recognition problems before choosing a new voice provider.

Release readiness also requires deployment/authentication hardening, retention/backups policy, and a release signing key. None of those require adding gamification or a larger UI.

## Google accounts and Play install

- Cancel the Google chooser; return to a usable welcome screen. Retry with a Gmail or another verified Google account.
- Close/reopen the app; remain signed in without seeing a server address or token field.
- Practice with account A, sign out, then sign in with B. B must not see A's history, assessment, active conversation or memory. Return to A and verify its progress remains.
- Sign in on another device. Sign out on one device; the other stays signed in. Delete a test account and verify both devices lose access while another user's data remains.
- Simulate no network during sign-in, conversation, sign-out, and deletion. Failed deletion must not report success. Local sign-out must clear the account.
- Test the web account-deletion page in a real browser with Google sign-in and its production Content Security Policy.
- Repeat from a Google Play **internal testing** installation using the Play app signing certificate, not just the local debug APK.
