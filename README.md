# Fala

<img src="assets/branding/fala-logo.png" width="160" alt="Fala logo">

A native Android app for learning to **speak Brazilian Portuguese** through natural conversations. Open it, tap **Talk**, listen, and speak. English/Hebrew help gets you unstuck; selective feedback and personal memory guide later conversations. No XP, streaks, or random flashcards.

**Native Android, Google sign-in, separate learner accounts.** Users install Fala, sign in with Google, and tap Talk. The app knows the service address; there are no server or token fields to configure. Netlify runs the conversation API and public pages; PostgreSQL (including Supabase) stores accounts, transcripts, and learning memory.

## Publisher setup

1. Follow [Google sign-in setup](docs/google-sign-in.md): create Web and Android OAuth clients in your Google Cloud project and register the installed app's signing certificate.
2. Apply both files in `supabase/migrations/` in filename order to the app's PostgreSQL database. Existing single-learner data stays isolated in a legacy operator account.
3. Configure `GOOGLE_WEB_CLIENT_ID`, `DATABASE_URL`, and the AI provider on Netlify. See [deployment and Haifa latency](docs/deployment.md).
4. Deploy once the database and Google settings are ready, install the APK, and test with two Google accounts before inviting users.
5. Follow [Google Play preparation](docs/google-play.md) for the signed app bundle, listing, privacy/deletion pages, and internal testing.

The current service URL is `https://legendary-florentine-6b3c1f.netlify.app`, compiled into Android. AI keys and database passwords stay on the server. Each sign-in issues a separate 90-day device session; Android encrypts the credential with Keystore, and the database stores only its hash. Optional `FALA_TOKEN` is **operator-only** diagnostics/legacy access, never a user-facing setup step.

**Deployment status:** the reported Netlify Database/AI Gateway modifications are not in the GitHub source available for this branch. Reconcile that deployment before replacing production. This checkout uses explicit database/provider environment variables. Google Cloud registration, remote migration/deployment, physical-device acceptance, and Play Console submission are separate from passing local build checks.

Live conversation needs an AI provider key. The default is Groq's compatible API with `openai/gpt-oss-120b`, matching the adjacent chatbot's model conventions. Android handles recognition and Brazilian voice playback, so a speech model is not required for this version. AI usage is billed separately from hosting.

## Android

Requires Android 8.0+ and an installed **Brazilian Portuguese** voice. On-device recognition depends on your Android version and language service; network recognition is optional with consent. The app never substitutes a Portugal voice.

- Download `fala-debug-apk` from a successful run in **Actions → Build and check Fala**. Unzip it, transfer `app-debug.apk` to your phone, and install it. GitHub may require sign-in for artifacts.
- Or open `android/` in Android Studio with SDK 36, build tools 35.0.0 and Java 17/21, and run:

```bash
cd android
./gradlew :app:assembleDebug :app:lintDebug
```

The result is `android/app/build/outputs/apk/debug/app-debug.apk`. Debug builds use a development signing key. GitHub runners may generate a different key each run; keep your local keystore for upgrade installs. For repeatable CI debug builds, configure `FALA_DEBUG_KEYSTORE_BASE64` with your existing debug key. For Play installs, register the Play app signing certificate instead. [Release signing and upload instructions](docs/google-play.md).

Sign in with Google, grant microphone permission, and tap **Talk** for the initial assessment. Finish after at least five Portuguese replies for a provisional snapshot. Later conversations use your retained profile. **Speak now** interrupts playback; **Pause** also suppresses a reply still being generated. **What should I say?** accepts spoken English/Hebrew and returns to Portuguese practice.

## Development and checks

Node 22.22+ (22.x) is required. Automated tests need no cloud account or AI key.

```bash
npm ci
npm test
npm run build
npx netlify functions:build --src netlify/functions --functions .netlify/functions
```

For local development, create `.env` using `.env.example` in a fresh checkout and fill in a development database connection and Google client ID (or optional operator token for API-only testing). Apply both migrations, then run `npm run dev` and use its printed URL. `FALA_DEMO=true` enables explicitly scripted connection tests, excluded from learning metrics; it cannot translate or assess you.

For loopback PostgreSQL only, `FALA_LOCAL_DATABASE=true` disables TLS. Hosted connections require TLS. The distributed Android app uses the compiled HTTPS service URL. To target a local development server, change `API_BASE_URL` in the Android build configuration and rebuild a debug APK; Android has no editable server setting. The emulator uses `10.0.2.2` to reach the host machine.

## Included

- Automatic turn-based pt-BR speech → AI reply → Brazilian voice; replay, slower playback, silence handling, tap-to-interrupt, lifecycle pausing.
- Adaptive conversations and assessment with separate evidence-based dimensions. Pronunciation is unassessed without audio analysis; confidence is self-reported.
- English/Hebrew rescue, optional transcript, history, and up to three useful corrections. Invented quotes, no-op corrections, and corrections to valid numeric age statements are discarded.
- Recurring mistakes counted across distinct conversations, assisted-phrase memory, next-day review context, and up to five phrases from your actual session.
- Speaking time, conversations, topics, help requests, and recurring patterns. Individual deletion removes a session's derived memory; delete-all removes retained learner data.
- Google sign-in for multiple learners, per-user data and mutation locks, revocable sessions, in-app/web account deletion, and per-user/app daily AI budgets.
- Database-backed retry protection and rate limits across Netlify instances. One saved reply lets Android start playback; the dashboard loads in one client request.
- Generated Fala logo in the adaptive Android icon, app header, and landing page. [Logo source and generation prompt](assets/branding/README.md).

## Practical limits

Build checks do not establish live Portuguese coaching quality or phone audio behavior. A live provider, a deployed project, and a physical phone are still required for [device acceptance checks](docs/device-checks.md). See [validation results](docs/validation.md) and [architecture](docs/architecture.md).

Speech is turn-based, with tap-to-interrupt; streaming speech-to-speech and automatic simultaneous interruption are future work. Recognition and voice quality depend on the phone's engines. Review uses a next-day schedule, not mastery-based spacing. No audio-based pronunciation score or invented fluency trend is shown.

Fala creates no audio recordings. Android's recognition/TTS provider may process audio remotely. The text AI provider receives conversation text. The configured PostgreSQL host retains transcripts and derived memory until deletion. App deletion cannot erase provider logs or database backups. `.env`, local tools, databases, and build outputs are excluded from Git.
