# Fala

**Use Fala on iPhone, Android or a computer:** [Open the web app](https://falachatapp.netlify.app/app/). Web and Android 0.12.3 keep the microphone and reply controls in reach, with compact Portuguese/Hebrew or English cards, spoken answer ideas and shared learner progress. [Setup and browser details](docs/web-app.md).


<img src="assets/branding/fala-logo.png" width="160" alt="Fala logo">

A native Android app for learning to **speak Brazilian Portuguese** through natural conversations. Choose English or Hebrew once, tap **Talk**, and listen to Fala’s first question. Hold to speak, release, review your words, and send. English/Hebrew help gets you unstuck; selective feedback and personal memory guide later conversations. Earn practice points, build a gentle daily streak, and unlock new looks.

**Native Android, Google sign-in, separate learner accounts.** Users install Fala, sign in with Google, and tap Talk. The app knows the service address; there are no server or token fields to configure. Netlify runs the conversation API and public pages; PostgreSQL (including Supabase) stores accounts, transcripts, and learning memory.

## Publisher setup

1. Follow [Google sign-in setup](docs/google-sign-in.md): create Web and Android OAuth clients in your Google Cloud project and register the installed app's signing certificate.
2. Apply all files in `supabase/migrations/` in filename order to the app's PostgreSQL database. Existing single-learner data stays isolated in a legacy operator account.
3. Configure `GOOGLE_WEB_CLIENT_ID`, `DATABASE_URL`, and the AI provider on Netlify. See [deployment and Haifa latency](docs/deployment.md).
4. Deploy once the database and Google settings are ready, install the APK, and test with two Google accounts before inviting users.
5. Follow [Google Play setup](docs/google-play.md) for the first app-bundle upload and one-time publishing credentials. Thereafter, successful `main` checks trigger a newly versioned, signed internal-testing upload when enabled.

The current service URL is `https://falachatapp.netlify.app`, compiled into Android. AI keys and database passwords stay on the server. Each sign-in issues a separate 90-day device session; Android encrypts the credential with Keystore, and the database stores only its hash. Optional `FALA_TOKEN` is **operator-only** diagnostics/legacy access, never a user-facing setup step.

**Hosting:** this code uses the explicit Supabase/PostgreSQL connection and AI provider configured in Netlify. Google Play distributes the separate Android application; a server deployment does not update the phone UI. See [validation results](docs/validation.md) for tested behavior and remaining device checks.

The current economical setup uses **Groq for conversations and transcription**, keeping **OpenAI only for the natural Portuguese voice**. Set `FALA_AI_PROVIDER=groq`, `FALA_TRANSCRIPTION_PROVIDER=groq`, a `GROQ_API_KEY` (or the existing Groq compatible settings), and retain `FALA_OPENAI_API_KEY` for voice. The model defaults to `openai/gpt-oss-120b` on Groq. Free-tier account quotas apply; Fala does not silently switch conversations to paid OpenAI when Groq is unavailable. Native Android continues to use device speech services. [Deployment and provider configuration](docs/deployment.md).

## Android

Requires Android 8.0+ and an installed **Brazilian Portuguese** voice. On-device recognition depends on your Android version and language service; network recognition is optional with consent. The app never substitutes a Portugal voice.

- Download `fala-debug-apk` from a successful run in **Actions → Build and check Fala**. Unzip it, transfer `app-debug.apk` to your phone, and install it. GitHub may require sign-in for artifacts.
- Or open `android/` in Android Studio with SDK 36, build tools 35.0.0 and Java 17/21, and run:

```bash
cd android
./gradlew :app:assembleDebug :app:lintDebug
```

The result is `android/app/build/outputs/apk/debug/app-debug.apk`. Debug builds use a development signing key. GitHub runners may generate a different key each run; keep your local keystore for upgrade installs. For repeatable CI debug builds, configure `FALA_DEBUG_KEYSTORE_BASE64` with your existing debug key. For Play installs, register the Play app signing certificate instead. [Release signing and upload instructions](docs/google-play.md).

Sign in with Google and choose English or Hebrew for translations. Choose **Capoeira class** or **Everyday life**, then tap **Talk**. Fala speaks first and offers translated answer ideas. **Listen first** keeps the question and ideas hidden until requested. **Try without answer ideas** lets later replies count as your own practice; revealing an idea marks that answer as guided even if you hide it again. **Hold to speak**, wait for **Listening**, speak, release, check the words and **Send**. The microphone never opens automatically. Recognition is unchanged; you can correct its text before sending.

After ten Portuguese answers, Fala gives a short review with **up to five useful words**, favoring relevant words absent from your retained history. Unused answer ideas and common fillers do not fill the list. You can finish early or ask for help in English/Hebrew; help turns do not count toward ten. Old reviews are also displayed compactly.

**Five practice levels** progress from short phrases to full sentences, connected answers, roughly three-sentence explanations, and flexible scenarios. Pick an easier or harder level at home, or follow Fala's recommendation. Two completed sessions with at least six varied, relevant spoken answers of the target length, without answer ideas, support a higher recommendation. Typed, copied, guided and demo replies do not advance it. This is a practice heuristic, not a CEFR grade, pronunciation test or guaranteed outcome after a fixed number of days. See [the progression method](docs/learning-progression.md).

## Development and checks

Node 22.22+ (22.x) is required. Automated tests need no cloud account or AI key.

```bash
npm ci
npm test
npm run build
npx netlify functions:build --src netlify/functions --functions .netlify/functions
```

For local development, create `.env` using `.env.example` in a fresh checkout and fill in a development database connection and Google client ID (or optional operator token for API-only testing). Apply all migrations in filename order, then run `npm run dev` and use its printed URL. `FALA_DEMO=true` enables explicitly scripted connection tests, excluded from learning metrics; it cannot translate or assess you.

For loopback PostgreSQL only, `FALA_LOCAL_DATABASE=true` disables TLS. Hosted connections require TLS. The distributed Android app uses the compiled HTTPS service URL. To target a local development server, change `API_BASE_URL` in the Android build configuration and rebuild a debug APK; Android has no editable server setting. The emulator uses `10.0.2.2` to reach the host machine.

## Included

- Partner-first Portuguese speech and visible text, remembered English/Hebrew translations, and two translated reply ideas. Hold-to-speak capture, review before sending, editable text fallback, replay, slower playback, and lifecycle pausing.
- Five visible practice levels with matching prompt and answer lengths, immediate feedback and a ten-answer summary. Level 1 retains the eight-word opening, seven-word ideas and sixteen-word follow-ups; higher levels gradually expand these limits. [ABADÁ capoeira lessons](docs/abada-curriculum.md) rotate through 19 themes covering kicks, movements, instruments, adult cord colors and class exercises. An optional listen-first view and answer-idea controls support independent practice.
- English/Hebrew rescue, visible current question and answer draft, history, and up to three useful corrections. Invented quotes, no-op corrections, and corrections to valid numeric age statements are discarded.
- Recurring mistakes counted across distinct conversations, assisted-phrase memory, next-day review context, and up to five review phrases. Word reviews contain at most five useful translated items with actual-dialogue counts and prior-history markers, including when opening an older report. New in Fala does not mean unknown to you.
- Speaking time, conversations, topics, help requests, and recurring patterns. Individual deletion removes a session's derived memory; delete-all removes retained learner data.
- Google sign-in for multiple learners, per-user data and mutation locks, revocable sessions, in-app/web account deletion, and per-user/app daily AI budgets.
- Database-backed retry protection and rate limits across Netlify instances. One saved reply lets Android start playback; the dashboard loads in one client request.
- Generated Fala logo in the adaptive Android icon, app header, and landing page. [Logo source and generation prompt](assets/branding/README.md).

## Practical limits

Build checks do not establish live Portuguese coaching quality or phone audio behavior. A live provider, a deployed project, and a physical phone are still required for [device acceptance checks](docs/device-checks.md). See [validation results](docs/validation.md) and [architecture](docs/architecture.md).

Speech is turn-based, with hold-to-speak and explicit sending; streaming speech-to-speech and automatic simultaneous interruption are future work. Recognition and voice quality depend on the phone's engines. Review uses a next-day schedule, not mastery-based spacing. No audio-based pronunciation score or invented fluency trend is shown.

Fala creates no audio recordings. Android's recognition/TTS provider may process audio remotely. The text AI provider receives conversation text. The configured PostgreSQL host retains transcripts and derived memory until deletion. App deletion cannot erase provider logs or database backups. `.env`, local tools, databases, and build outputs are excluded from Git.

Practice rewards, friend circles, notification setup and migration details: [Gamification](docs/gamification.md).

Google Play listing assets, native screenshot capture and closed-test preparation: [publishing guide](docs/google-play.md). AI-content reports: [operator review guide](docs/content-reports.md).
