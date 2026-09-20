# Fala — Google Play release preparation

Publisher console: [Fala internal testing](https://play.google.com/console/u/0/developers/8995855757695563557/app/4974746035671245197/tracks/internal-testing). The existing app has received both manual and automated internal-testing releases.

Prepared application: **Fala**, package **com.fala.app**, version **0.9.1** (local version code 10; CI assigns a higher code), Android 8.0+, target SDK 36. Confirm package availability when creating the app; a first upload fixes the package identity. Do not change it after publishing.

## Files

- `artifacts/fala-release.aab`: locally signed upload bundle, for a **new** Play app using the generated upload key.
- `artifacts/fala-debug.apk`: sideload testing build, with a different debug signing certificate.
- `artifacts/fala-upload-certificate.pem`: public upload certificate.
- `artifacts/google-android-registration.txt`: public package/certificate information.
- `artifacts/fala-upload.jks` and `artifacts/fala-signing.env`: **private** upload key and passwords. Back these up in secure private storage before the first upload. They are excluded from Git and must not be published as build artifacts. Keep using this key for updates; don't generate a new key on every build.

To rebuild a signed bundle locally, export the four `FALA_UPLOAD_*` variables from your private signing file and run `./gradlew :app:bundleRelease :app:lintRelease` from `android/`. Without signing variables, `bundleRelease` is an unsigned verification build, not an upload-ready release.

## Automatic updates after the first upload

The **Publish Play internal testing** workflow runs after **Build and check Fala** succeeds for a push to `main`. A manual run is also available from `main`. The publishing workflow must be present on the default branch; publishing is inactive until `FALA_PLAY_UPLOAD_ENABLED=true` and the credentials below are installed.

It checks/builds a signed AAB from the checked commit, verifies it, and uploads through Google's publishing API to **internal testing**. Each run gets version code `100000 + (workflow run number × 100) + run attempt`, so normal updates and reruns do not require editing the Android version manually. Every release also updates the visible version and adds `releases/<version>.txt` (at most 500 characters). The build checks that Android, web, service-worker cache and package versions agree. The Play release name and notes come from this checked metadata. Do not reset the workflow's run numbering or upload unrelated larger version codes without adjusting this scheme.

Publishing runs are serialized. Older commits are skipped if main has advanced, checked both before building and immediately before uploading. The publisher rejects a used/older code, checks Google's uploaded bundle hash and version, and commits only the internal track. It fails if another Google review is already in progress instead of canceling it. There is no automatic production rollout. Google may still require review or account actions; “completed” in the API is a track release status, not a promise of immediate review approval.

### One-time account connection

1. In Play Console, finish the first manual AAB upload/release using the existing `artifacts/fala-release.aab` and Play App Signing. Add yourself under the internal track's **Testers** tab. Google's edit API requires an existing app with an initial Console upload. [Google edit API prerequisites](https://developers.google.com/android-publisher/edits).
2. In your Google Cloud project, enable the [Google Play Android Developer API](https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com). Create a service account called `fala-github-publisher`. Broad Cloud project Owner/Editor roles are not required for this workflow.
3. In Play Console → **Users and permissions**, invite the service account's email. Limit app access to **Fala** and grant **View app information (read only)** and **Release apps to testing tracks**. App signing setup and tester-list changes are handled once by the owner. Production, financial, and account-admin permissions are not needed by the upload script. [API account setup](https://developers.google.com/android-publisher/getting_started), [Play permissions](https://support.google.com/googleplay/android-developer/answer/10019561).
4. In Google Cloud → service account → **Keys**, create/download a JSON key. Save it locally as `artifacts/play-service-account.json` (ignored by Git). This publishing key is separate from the Google Web client ID used for user sign-in.
5. Authenticate [GitHub CLI](https://cli.github.com/) with `gh auth login`, then run from this checkout:

```bash
python3 scripts/configure-play-publishing.py artifacts/play-service-account.json
```

The helper sends secrets privately to GitHub using stdin. It reads the existing signing key/passwords from the ignored `artifacts/fala-signing.env`, installs the four signing secrets and `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, and enables uploads only after setup succeeds. It does not upload an app immediately. The next successful main check, or a manual publishing run from main, uploads a new build. The helper intentionally disables publishing while replacing credentials so incomplete setup cannot start a release.

For setup through GitHub's web UI instead, add repository Actions secrets `FALA_UPLOAD_KEYSTORE_BASE64`, `FALA_UPLOAD_STORE_PASSWORD`, `FALA_UPLOAD_KEY_ALIAS`, `FALA_UPLOAD_KEY_PASSWORD`, and `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. Use the existing upload keystore, not a newly generated key. Add Actions variables `FALA_PLAY_UPLOAD_ENABLED=true` and `FALA_PLAY_RELEASE_STATUS=completed`. Temporarily use `draft` only if the app's first-release state requires draft uploads; drafts need a Console rollout and are not automatic tester updates.

Set `FALA_PLAY_UPLOAD_ENABLED=false` to stop subsequent publishing runs. App users still need the Google sign-in/backend setup; an uploaded bundle does not provision those settings.

### Current connection status

On 20 September 2026, the owner enabled the Play Developer API, granted `fala-github-publisher@fala-509021.iam.gserviceaccount.com` access to Fala and stored its JSON key as a repository secret. The four existing upload-signing secrets were installed after verifying the certificate against the original Play upload key. Automatic internal-testing releases are enabled with status `completed`. The [first verified automated upload](https://github.com/gdarmon/SpeechApp/actions/runs/35518221629) published Fala 0.9.0, build 101801, with its release notes. Check the **Publish Play internal testing** Actions run for the actual result of each subsequent upload; configuration alone does not confirm publication.

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

This preparation does not upload to Play or deploy Netlify. After the one-time connection, the workflow uploads internal-testing releases on successful main updates.
