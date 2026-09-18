# Fala

<img src="assets/branding/fala-logo.png" width="160" alt="Fala logo">

A native Android app for learning to **speak Brazilian Portuguese** through natural conversations. Open it, tap **Talk**, listen, and speak. English/Hebrew help gets you unstuck; selective feedback and personal memory guide later conversations. No XP, streaks, or random flashcards.

**Ready for Netlify + Supabase.** Netlify runs the private conversation API and landing page. Supabase PostgreSQL stores transcripts and learner memory. The app itself remains native Android; Netlify does not build or run the Android UI.

## Set it up

Follow the [step-by-step setup](docs/deployment.md), written for a **new Supabase project**, **Netlify Personal**, and use from **Haifa, Israel**.

1. Import this GitHub repository into Netlify, using the repository root. `netlify.toml` supplies the build settings.
2. Check the function region, then create Supabase in the same region. For a new Netlify Personal site the current default is Ohio (`us-east-2`).
3. Run [the SQL migration](supabase/migrations/202609180001_fala.sql) in your new Supabase project's SQL Editor.
4. Add `DATABASE_URL`, `FALA_TOKEN`, and `OPENAI_API_KEY` in Netlify's environment settings, then redeploy. The setup guide explains pooler selection and exact values.
5. Install the Android APK and enter your Netlify HTTPS address and **device token** once.

The AI provider key and database password stay on Netlify. **Do not put them in Android.** The device token is a separate random secret, encrypted on the device using Android Keystore. This is a private, single-learner app: everyone with that token can access and delete the same learner data.

Live conversation needs an AI provider key. The default is Groq's compatible API with `openai/gpt-oss-120b`, matching the adjacent chatbot's model conventions. Android handles recognition and Brazilian voice playback, so a speech model is not required for this version. AI usage is billed separately from hosting.

## Android

Requires Android 8.0+ and an installed **Brazilian Portuguese** voice. On-device recognition depends on your Android version and language service; network recognition is optional with consent. The app never substitutes a Portugal voice.

- Download `fala-debug-apk` from a successful run in **Actions → Build and check Fala**. Unzip it, transfer `app-debug.apk` to your phone, and install it. GitHub may require sign-in for artifacts.
- Or open `android/` in Android Studio with SDK 36, build tools 35.0.0 and Java 17/21, and run:

```bash
cd android
./gradlew :app:assembleDebug :app:lintDebug
```

The result is `android/app/build/outputs/apk/debug/app-debug.apk`. Debug builds use a development signing key. GitHub runners may generate a different key each run; keep your local keystore for upgrade installs. A Play Store release and release signing are separate work.

Connect, grant microphone permission, and tap **Talk** for the initial assessment. Finish after at least five Portuguese replies for a provisional snapshot. Later conversations use your retained profile. **Speak now** interrupts playback; **Pause** also suppresses a reply still being generated. **What should I say?** accepts spoken English/Hebrew and returns to Portuguese practice.

## Development and checks

Node 22.22+ (22.x) is required. Automated tests need no cloud account or AI key.

```bash
npm ci
npm test
npm run build
npx netlify functions:build --src netlify/functions --functions .netlify/functions
```

For local development, create `.env` using `.env.example` in a fresh checkout and fill in a development database connection and token. Apply the migration, then run `npm run dev` and use its printed URL. `FALA_DEMO=true` enables explicitly scripted connection tests, excluded from learning metrics; it cannot translate or assess you.

For loopback PostgreSQL only, `FALA_LOCAL_DATABASE=true` disables TLS. Hosted connections require TLS. Release Android builds require HTTPS; debug builds allow local HTTP. The emulator uses `10.0.2.2` to reach the host machine.

## Included

- Automatic turn-based pt-BR speech → AI reply → Brazilian voice; replay, slower playback, silence handling, tap-to-interrupt, lifecycle pausing.
- Adaptive conversations and assessment with separate evidence-based dimensions. Pronunciation is unassessed without audio analysis; confidence is self-reported.
- English/Hebrew rescue, optional transcript, history, and up to three useful corrections. Invented quotes, no-op corrections, and corrections to valid numeric age statements are discarded.
- Recurring mistakes counted across distinct conversations, assisted-phrase memory, next-day review context, and up to five phrases from your actual session.
- Speaking time, conversations, topics, help requests, and recurring patterns. Individual deletion removes a session's derived memory; delete-all removes retained learner data.
- Database-backed retry protection and rate limits across Netlify instances. One saved reply lets Android start playback; the dashboard loads in one client request.
- Generated Fala logo in the adaptive Android icon, app header, and landing page. [Logo source and generation prompt](assets/branding/README.md).

## Practical limits

Build checks do not establish live Portuguese coaching quality or phone audio behavior. A live provider, a deployed project, and a physical phone are still required for [device acceptance checks](docs/device-checks.md). See [validation results](docs/validation.md) and [architecture](docs/architecture.md).

Speech is turn-based, with tap-to-interrupt; streaming speech-to-speech and automatic simultaneous interruption are future work. Recognition and voice quality depend on the phone's engines. Review uses a next-day schedule, not mastery-based spacing. No audio-based pronunciation score or invented fluency trend is shown.

Fala creates no audio recordings. Android's recognition/TTS provider may process audio remotely. The text AI provider receives conversation text. Supabase retains transcripts and derived memory until deletion. App deletion cannot erase provider logs or database backups. `.env`, local tools, databases, and build outputs are excluded from Git.
