# Fala — Google Play release preparation

Publisher console: [Fala internal testing](https://play.google.com/console/u/0/developers/8995855757695563557/app/4974746035671245197/tracks/internal-testing). The existing app has received both manual and automated internal-testing releases.

Prepared application: **Fala**, package **com.fala.app**, version **0.12.4** (local version code 17; CI assigns a higher code), Android 8.0+, target SDK 36. Confirm package availability when creating the app; a first upload fixes the package identity. Do not change it after publishing.

## Files

For an update to the existing Fala app, use the signed bundle artifact from the latest successful **Publish Play internal testing** run. The local files below were used during initial setup and may contain an older version; they are not a substitute for checking the current workflow artifact. The store package is in `store/google-play/`.

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
5. Privacy URL: `https://falachatapp.netlify.app/privacy.html`. Account deletion URL: `https://falachatapp.netlify.app/delete-account.html`. Data deletion without closing the account: `https://falachatapp.netlify.app/delete-data.html`. Deploy and test both before submitting.
6. Use the prepared assets in `store/google-play/`: 512px icon, 1024×500 feature graphic, and native Android screenshots for phones, 7-inch tablets and 10-inch tablets. Screens show the real UI with fictional examples; they do not document a live sign-in test.
7. Complete any account-specific testing or verification requirements displayed by Play Console before requesting production access. New personal developer accounts may require at least 12 opted-in closed testers for 14 continuous days; this depends on the account, not just the app.

[Play app signing](https://developer.android.com/studio/publish/app-signing), [testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465), [target SDK requirements](https://support.google.com/googleplay/android-developer/answer/11926878).

## Store listing package

The current English listing is in `store/google-play/en-US/`: title, short description and full description. Use these files as the source of truth. `store/google-play/app-access.txt` contains reviewer instructions, and `store/google-play/console-answers.md` contains grounded drafts for the remaining Console forms and the closed-testing requirement.

**Prepare Google Play store** is a manual workflow. Its default `capture` mode audits the existing listing without committing changes and captures actual Compose UI on an emulator in three display sizes. The synthetic account exists only in the instrumentation test, not in the shipped app.

Its `upload` mode publishes the checked-in listing and images, sets the support contact, and fills an empty closed-testing draft with the matching completed internal build. It never changes production or enrolls testers, and fails rather than canceling an existing review or replacing unfamiliar store images. The service account needs **Manage store presence** for Fala in addition to its existing testing permissions. Native screenshots must be checked into `store/google-play/screenshots/` first.

The owner confirmed that production access is blocked for this account. At least 12 testers must opt into **closed testing** for 14 continuous days before applying; the existing internal track does not meet that requirement. Complete all Console setup tasks and collect genuine tester feedback. Production access still requires Google's approval.

## Data safety preparation

The checked-in privacy page describes current application behavior and lists the support address. Before publication, identify the production database/AI providers and their configured retention periods; update the policy with those exact operational details.

Data handled by Fala includes Google account ID/email, conversation text and AI replies, assessment/learning records, speech-duration metrics, and short-lived abuse counters. Android's optional network recognition can send audio to the device's speech provider; Fala itself does not record or upload audio. There are no advertising/analytics SDKs in this build. Declare collection, purposes, sharing/service-provider treatment, and retention according to Google's current form and actual provider arrangements. Do not blindly mark all data as “not collected.”

Account deletion is available in-app and on the web and cascades through account credentials and learning data. Support email provides a fallback for users who cannot access Google sign-in; verify ownership without requesting passwords or codes.

[Google's Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469), [account deletion requirement](https://support.google.com/googleplay/android-developer/answer/13327111).

The main publishing workflow uploads internal-testing releases after successful checks. Store metadata changes use the separate manual workflow above. Neither workflow releases to production.
