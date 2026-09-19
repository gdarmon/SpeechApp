# Validation

## 0.5.0 — 19 September 2026

- 47 backend tests passed, including short opening/follow-up constraints, selected-language checks, required current-answer feedback, grounded corrections, closing after ten answers, help-turn counting, summary persistence/retries, vocabulary exposure counts, cross-account word-history isolation, and compatibility with older saved replies. Netlify API packaging and TypeScript/site builds passed.
- Six Android JVM tests passed for drafts and correction playback. Debug APK, signed version-6 release AAB (0.5.0), and debug/release lint passed with zero errors. The release signature matches the existing Play upload certificate; checksums accompany the versioned artifacts.
- Groq GPT-OSS uses strict JSON output shapes. Semantic constraints still use validation plus at most one regeneration within the original timeout. Other compatible providers retain JSON object mode. Live attempts exposed missing feedback, incorrect language, copied feedback, and mixed conversation roles; the output shape, shorter AI context, and teaching instructions were adjusted. Rapid test traffic also encountered provider rate limits and an upstream rejection; the app retains retryable requests rather than claiming those requests succeeded.
- A complete local API run against the configured Groq service and actual Supabase completed ten Hebrew-supported answers with a help request, closing reply, summary, 57 translated words, idempotent retries and saved resume. An English follow-up confirmed prior-word exposure. All temporary accounts and their practice data were deleted. This checks real text service integration, not physical speech recognition/playback.
- New feedback, summary pointers and vocabulary are stored in existing JSON columns. No database migration is required.
- Physical speaker/headset output, delayed voice-engine startup, hold/release interaction, the final voice-to-summary transition, and Hebrew layout still require the new build on a phone. Build/unit success does not establish those device behaviors.
- The signed bundle is ready for Google Play internal testing. Automatic Play upload remains disabled pending publishing credentials; no Play upload is claimed.

## 0.4.0 — 19 September 2026

- 36 backend tests passed, covering saved support language, translated reply ideas, resumable sessions, typed/guided answer provenance, assessment exclusions, and existing authentication/privacy/retry checks. Provider responses missing a translation or either reply idea, or mixing Hebrew letters into Portuguese, are regenerated once within the original timeout and rejected if still invalid.
- Three Android JVM tests passed for multi-segment drafts, editing recognized words, and retaining assistance markers. Debug APK, signed version-4 release AAB, and debug/release lint passed.
- The new local API handler was tested against the actual configured AI and Supabase: English and Hebrew starts/turns, two translated suggestions per reply, exact start/turn retries, saved language and answer metadata on resume, typed/spoken progress separation, and account deletion all succeeded. Temporary verification accounts and their learner data were removed afterward.
- The first production check hit an intermittent reply failure; a repeated full check passed English/Hebrew conversation, help, feedback, retry persistence, and progress. Inspection also caught Hebrew letters inside a Portuguese suggestion, which prompted the output validation and bounded regeneration above.
- No database migration is required for this change. The new session/turn metadata uses existing JSON columns, and old clients can omit it.
- Physical hold/release timing, device recognition, audio playback, Hebrew layout, permission dialogs, and accessibility still need verification on a phone using the new build. Passing the build does not establish those behaviors.
- Play publishing credentials are still a separate setup step. Building a signed bundle does not upload it or update an installed app.

## Historical results — 18 September 2026

Completed locally for 0.3.0:

- Android debug APK and **signed release App Bundle** built with Google Credential Manager, a built-in service address, account switching, encrypted session storage, and account deletion. There are no editable server/token fields.
- Debug and release lint: **0 errors, 12 advisory warnings** each. Debug APK signature and release bundle signature verified. Every bundled native library's ELF load segments support at least 16 KB alignment; physical 16 KB device behavior and Play processing still need validation.
- Release manifest disables cleartext traffic and backups. Extraction rules exclude private data from cloud/device transfer.
- **32 automated tests passed** using embedded PostgreSQL (PGlite) and real SQL migrations. They cover Google JWT signature/issuer/audience/expiry/nonce/email checks, nonce mismatch/replay/concurrent exchange, hashed and expiring device credentials, arbitrary Google subjects and email changes, cross-account session reads/writes/deletions/retry IDs, progress/memory separation, logout, account-deletion cascades, per-user/app budgets, public database role denial, and the original conversation/feedback regression suite.
- TypeScript checks and static-site build passed. Netlify's full offline build packaged the function successfully, including `/auth/*`, `/account`, learning routes, and `/api/*` aliases. No site deploy was triggered.
- New Google dependency and lockfile were installed with npm 10. A separate clean `npm ci` under npm 10.9.2 passed. Dependency audit: zero known vulnerabilities at install time.
- Account-deletion JavaScript passes the syntax check. Google OAuth and browser flow still require the actual registered client ID and deployed origin; no live Google sign-in is claimed.
- Automatic version override was built as a signed release with version code 90000 and release lint passed; the original version-3 first-upload AAB was left unchanged. GitHub workflow validation passed with actionlint.
- Play publishing tests verify OAuth assertion signature/scope, unique version allocation, upload checksum/version verification, rejection of older builds, fixed internal-track updates, explicit drafts, failure cleanup and redaction of credentials.
- The publishing workflow builds/signs, saves an AAB artifact, and can upload internal releases after successful main checks. It remains inactive until the publisher connects credentials and enables its repository variable. No live upload is claimed. Stable debug signing in CI remains optional via a private repository secret.
- Official Gradle wrapper distribution checksum remains pinned.

The PostgreSQL tests run locally with a fake AI provider. PGlite serializes its transactions; concurrency tests establish idempotent replay through independent handlers, and simulated lock contention checks the conflict response. They do not establish real cloud connection pooling or distributed load performance.

Still requires cloud configuration and a phone:

- Reconciliation of the separately reported Netlify Database/AI Gateway source changes with GitHub. This checkout still uses explicit database and provider settings; blindly replacing the existing deployment is not validated.
- Google Cloud Web/Android OAuth clients, correct debug and Play app signing fingerprints, production database migration, and one deliberate Netlify deployment. These account settings are not accessible merely through a pasted Play Console link.
- Actual Google chooser/sign-in, account switching, browser-based account deletion and the deployed CSP, as well as the Play-delivered installation.
- Live AI replies, Portuguese coaching quality, actual Supabase/PostgreSQL connectivity, Haifa latency and capacity under multiple users. Local test AI is simulated and the database runs in-process.
- Physical microphone, pt-BR recognition/voice, speaker/headset and lifecycle behavior. See [device checks](device-checks.md).
- Play Console app creation/upload, screenshots/listing graphics, actual-provider privacy/retention details, Data safety/target audience declarations, account-specific testing requirements, and production review. See [Play preparation](google-play.md).

The locally built APK is `artifacts/fala-debug.apk` with a sibling SHA-256 file. Build outputs, private configuration, learner databases, downloaded toolchains, and local caches are excluded from Git. The signed upload bundle is `artifacts/fala-release.aab`; private upload signing material is also ignored and must be backed up securely. GitHub Actions builds a downloadable debug APK from source. See [deployment steps](deployment.md).
