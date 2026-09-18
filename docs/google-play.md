# Fala — Google Play release preparation

Publisher console: [your developer account](https://play.google.com/console/u/0/developers/8995855757695563557/app-list).

Prepared application: **Fala**, package **com.fala.app**, version **0.3.0 (3)**, Android 8.0+, target SDK 36. Confirm package availability when creating the app; a first upload fixes the package identity. Do not change it after publishing.

## Files

- `artifacts/fala-release.aab`: locally signed upload bundle, for a **new** Play app using the generated upload key.
- `artifacts/fala-debug.apk`: sideload testing build, with a different debug signing certificate.
- `artifacts/fala-upload-certificate.pem`: public upload certificate.
- `artifacts/google-android-registration.txt`: public package/certificate information.
- `artifacts/fala-upload.jks` and `artifacts/fala-signing.env`: **private** upload key and passwords. Back these up in secure private storage before the first upload. They are excluded from Git and must not be published as build artifacts. Keep using this key for updates; don't generate a new key on every build.

To rebuild a signed bundle locally, export the four `FALA_UPLOAD_*` variables from your private signing file and run `./gradlew :app:bundleRelease :app:lintRelease` from `android/`. Without signing variables, `bundleRelease` is an unsigned verification build, not an upload-ready release.

The manual **Build Play bundle** workflow requires four repository secrets: `FALA_UPLOAD_KEYSTORE_BASE64`, `FALA_UPLOAD_STORE_PASSWORD`, `FALA_UPLOAD_KEY_ALIAS`, `FALA_UPLOAD_KEY_PASSWORD`. Store the base64 of the existing upload keystore, not a replacement key. It builds and checks the bundle; it does not upload or publish automatically.

## First release: internal testing

1. Complete [Google sign-in and backend setup](google-sign-in.md). The packaged app cannot sign in until that deployment is ready.
2. Create the app in Play Console and enable **Play App Signing**. Let Google manage the app signing key; retain the local upload key separately. Register the Play app signing certificate with Google's Android OAuth client.
3. Upload `fala-release.aab` to **Internal testing**, add testers, and use Play's opt-in/install link. Run sign-in and the speaking checklist from that installation before moving to a broader track.
4. Complete the app listing, content rating, target audience, app access instructions, and Data safety declarations based on the actual production configuration. Use **gdarmon@gmail.com** as the support email.
5. Privacy URL: `https://legendary-florentine-6b3c1f.netlify.app/privacy.html`. Account deletion URL: `https://legendary-florentine-6b3c1f.netlify.app/delete-account.html`. Deploy and test both before submitting.
6. Provide real phone screenshots and Play listing graphics. The in-app Fala logo is included; store-size icon and feature-graphic exports and actual device screenshots still need to be supplied. Do not substitute fabricated screenshots of an untested sign-in flow.
7. Complete any account-specific testing or verification requirements displayed by Play Console before requesting production access. New personal developer accounts may require at least 12 opted-in closed testers for 14 continuous days; this depends on the account, not just the app.

[Play app signing](https://developer.android.com/studio/publish/app-signing), [testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465), [target SDK requirements](https://support.google.com/googleplay/android-developer/answer/11926878).

## Listing copy

**App name:** Fala

**Short description:** Speak Brazilian Portuguese with natural conversations and useful feedback.

**Full description:**

Make room for speaking Brazilian Portuguese. Fala gives you a conversation partner for everyday situations, travel, work, hobbies, and the topics you want to explore.

Sign in with Google, tap Talk, and start speaking. Your partner replies in Brazilian Portuguese and helps you keep the conversation going. When you're stuck, ask for help in English or Hebrew, practice the Portuguese phrase, and continue.

After a conversation, review a few useful corrections and phrases from what you actually said. Fala remembers recurring patterns and brings them into future conversations. Your own account keeps your history and learning progress together.

Replay replies, slow the voice, pause, or show the transcript when useful. Delete individual conversations, clear your learning data, or delete your account in Settings.

No points, streaks, or random flashcards. Just more opportunities to find your own words.

An internet connection and Google account are required. Speech recognition and voice quality depend on your phone and installed Brazilian Portuguese voice. AI and speech recognition can make mistakes. Assessments are approximate and do not measure pronunciation from audio.

## Data safety preparation

The checked-in privacy page describes current application behavior and lists the support address. Before publication, identify the production database/AI providers and their configured retention periods; update the policy with those exact operational details.

Data handled by Fala includes Google account ID/email, conversation text and AI replies, assessment/learning records, speech-duration metrics, and short-lived abuse counters. Android's optional network recognition can send audio to the device's speech provider; Fala itself does not record or upload audio. There are no advertising/analytics SDKs in this build. Declare collection, purposes, sharing/service-provider treatment, and retention according to Google's current form and actual provider arrangements. Do not blindly mark all data as “not collected.”

Account deletion is available in-app and on the web and cascades through account credentials and learning data. Support email provides a fallback for users who cannot access Google sign-in; verify ownership without requesting passwords or codes.

[Google's Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469), [account deletion requirement](https://support.google.com/googleplay/android-developer/answer/13327111).

No Play Console upload, production release, paid plan change, or Netlify deployment is performed by this preparation.
