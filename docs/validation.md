# Validation

For current 0.14.2 checks, publication evidence and unverified live-content/phone/latency limits, see [the release record](releases/0.14.2.md). The sections below include historical validation and must not be treated as current-version device evidence.

## 0.12.3 — conversation reliability, 21 September 2026

- Reproduced Groq's shared 8,000-token/minute limit and the generic Android error it previously caused. Compact, conditional coaching instructions reduced the sampled opening input from 3,278 to 1,725 tokens. Low reasoning and bounded output budgets reduce additional token use; these sample counts are not a guarantee for every lesson.
- Provider throttles receive bounded retries within a shared deadline. Android and web can wait once more for a short provider limit while retaining the exact request ID and draft. Longer limits keep an explicit wait time and manual Retry. No paid-provider fallback was enabled.
- Malformed replies get one targeted repair using their rejected output and validation rules. Structured output constrains opening pace, translations and level-specific suggestion lengths. Diagnostics record fixed rule failures, never generated or learner text.
- 117 automated tests, clean npm 10.9.7 installation, build/function packaging, browser suites, Android unit tests, builds and lint passed. [Final checks](https://github.com/gdarmon/SpeechApp/actions/runs/35593925952).
- The deployed API at commit `94234de` completed ten Hebrew-supported capoeira exchanges, an identical-request retry, and a five-word summary. The stored conversation contained exactly ten turns. Short quota pauses recovered automatically, including a 21-second client wait on turn nine and a 19-second wait before the summary. Temporary test data was deleted.
- Live end-to-end response times varied: most early replies took about 2–4 seconds, while a heavily throttled turn took about 39 seconds including recovery. This verifies recovery, not unlimited free capacity or performance under many simultaneous learners. Higher Groq limits require a provider-plan change. Physical microphone/voice behavior was unchanged and was not re-tested on a phone.

## 0.8.0 — 20 September 2026

- Web conversation uses a viewport-sized layout with an independently scrolling reading area and a persistent reply composer. Native Android uses a compact fixed header and composer; both show question/ideas side by side on wider screens. Portuguese, Hebrew/English translations and audio controls stay together.
- Suggested text can be copied into the editable reply without submitting it. Voice playback stays separate. Secondary controls move into a labelled conversation options dialog. Audio, retry/idempotency and ten-answer feedback behavior remain covered by browser tests.
- Browser checks cover 390×844, 360×640, 320×568, 390×400 and 1280×800, and verify controls are on-screen and unobstructed even after scrolling. Browser fixture screenshots document the implemented UI. This is not a claim of physical iPhone or Android device testing.
- Android 0.8.0 (local version code 8) builds as a debug APK and a signed AAB using the existing upload certificate. Unit tests and debug/release lint pass. Google Play delivery still depends on the repository publishing credentials or uploading the signed bundle.


## ABADÁ curriculum update — 20 September 2026

- 68 backend tests passed. Coverage includes rotation through all lesson themes, changed focus on revisits, frozen lesson retries/resume, failed-start behavior, legacy-session compatibility, help-turn counting, user isolation/deletion, whole-expression counting and prior exposure, two-letter aú, and guards against repeated questions or choice loops. TypeScript/site build and Netlify function packaging passed.
- The final local API check completed ten beginner answers, a Hebrew help turn, a closing reply, and an idempotent five-item review: queixada, armada, martelo, devagar and meia-lua de frente. Subsequent starts selected instruments, first cord colors, evasions and exercises; level-4 opening and continuation also succeeded. Test accounts and all their practice data were deleted.
- This is a server-only update for the current Android app. It adds no database migration, changes no phone speech adapter and builds no replacement APK/AAB. The installed version remains 0.6.0.
- Live tests use temporary accounts with actual OpenAI GPT-5.6 Terra and Supabase. Early samples exposed too many either/or questions despite varied vocabulary; the final implementation adds explicit speaking tasks and validates open-question turns, repeated question clauses and topic vocabulary in openings. Reviewed words retain complete movement names and curated Hebrew meanings. Model-generated wording still requires ongoing quality observation; structural tests do not prove universal language accuracy or physical voice behavior.


## 0.6.0 — 19 September 2026

- 61 backend tests passed, including hidden-idea provenance, five-word selection, compact legacy reviews, unused suggestion exclusion, level-specific reply limits, qualification exclusions, saved level/retry behavior, advancement, deletion and cross-account isolation. TypeScript/site build and Netlify API packaging passed.
- Nine Android JVM tests passed, including sticky guidance provenance and separate question/answer reveals. Debug APK, signed version-7 AAB (0.6.0), and debug/release lint built successfully with zero lint errors. Recognition and speech adapters are unchanged.
- The local updated API with actual OpenAI GPT-5.6 Terra and Supabase completed ten Hebrew-supported capoeira answers, a Hebrew clarification request, a closing turn, a five-word review and an idempotent finish. Guided answers did not count toward advancement. A level-4 scenario then produced connected answers explaining a misunderstanding; its continuation passed. Temporary accounts and practice data were removed.
- In that sample, the five review items were devagar, repetir, ginga, lado and esquivar. A later regression refinement excludes unused generated answer ideas from vocabulary counts/history because the new UI can hide them. No claim of comprehensive language or pronunciation assessment is made.
- Levels and qualification metadata use existing JSON columns. No database migration is required. Older clients retain their existing controls and receive compact reviews; the new level picker, capoeira shortcut and listen-first display require 0.6.0.
- Phone layout, hint controls, automatic playback and the existing hold/release behavior still require physical verification. Practice levels are application heuristics; no CEFR certification or calendar-based learning guarantee is claimed. Play upload remains disabled pending publisher credentials; a signed bundle does not update installed phones by itself.

## 0.5.0 — 19 September 2026

- 51 backend tests passed, including short opening/follow-up constraints, selected-language checks, required current-answer feedback, grounded corrections and final reviews, closing after ten answers, help-turn counting, summary persistence/retries, vocabulary exposure counts, cross-account word-history isolation, paid-provider credential routing, and compatibility with older saved replies. Netlify API packaging and TypeScript/site builds passed.
- Six Android JVM tests passed for drafts and correction playback. Debug APK, signed version-6 release AAB (0.5.0), and debug/release lint passed with zero errors. The release signature matches the existing Play upload certificate; checksums accompany the versioned artifacts.
- Groq GPT-OSS and the supported OpenAI GPT-5.6 models use strict JSON output shapes. Semantic constraints still use validation plus at most one regeneration within the original timeout. A provider throttle with an explicit wait of at most five seconds can instead use that same single retry; longer or exhausted quotas return a retryable error. Other compatible providers retain JSON object mode. Live attempts exposed missing feedback, incorrect language, copied feedback, and mixed conversation roles; the output shape, shorter AI context, and teaching instructions were adjusted. Rapid test traffic also encountered provider rate limits and an upstream rejection; the app retains retryable requests rather than claiming those requests succeeded.
- A complete local API run against the configured Groq service and actual Supabase completed ten Hebrew-supported answers with a help request, closing reply, summary, 57 translated words, idempotent retries and saved resume. An English follow-up confirmed prior-word exposure. All temporary accounts and their practice data were deleted. This checks real text service integration, not physical speech recognition/playback.
- A production run also passed ten Hebrew-supported answers, help, a 62-word review, saved resume/retries and an English prior-word check. Reply requests took about 1.4–3.3 seconds in that run; the summary took 8.1 seconds. The generated summary introduced an unsupported grammar tip, prompting the final-review fix: factual practice counts and pointers now come from recorded coaching, and only previously delivered corrections can enter the review. Regression coverage includes valid article-free coffee requests and guided/typed answer counts.
- Paid OpenAI was activated in production on 19 September 2026. Operator diagnostics confirmed `gpt-5.6-terra`, live mode and a ready database. A temporary-account production check passed a short Hebrew-supported opening, correction of "Eu querer café", acknowledgement of a suggested reply as guided practice, and a saved/idempotent review with 18 translated words. Conversation requests took about 2.4–3.9 seconds and the review 4.1 seconds in this sample (server timing, excluding phone recognition/playback and network round-trip). Both parts of "por favor" were correctly explained as belonging to "please". Test data was deleted. This is a small text-coaching sample, not a comprehensive language-quality or physical voice test; the earlier full ten-answer integration run used Groq.
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

## 0.10.0 — practice rewards

- 89 backend tests pass, including reward caps and retry protection, earned cosmetic enforcement, private circles, rejected invitation rate limits, Israel time zones and reminder deduplication.
- Clean `npm ci`, version/notes validation and Netlify API/reminder function bundles pass.
- Browser checks cover actual app controls at 320, 390 and 1024-pixel widths, dark theme previews/equipping, circle creation, reminder preferences, reduced motion, sign-out cleanup, and existing speech/retry/offline behavior.
- Android debug build, unit tests and lint pass. Scheduling tests include Jerusalem's autumn clock change.
- The six additive production rewards tables have row security enabled. Real-device push permissions, background delivery and Android appearance need device testing; automated checks do not establish exact-time notification delivery.

The initial GitHub install found optional Netlify peer dependencies pruned by local npm 12. The lockfile was regenerated with npm 10 and checked using CI's npm 10.9.7. This build-only correction keeps app version 0.10.0.

## 0.11.0 — new address and split AI providers

- Clean npm 10.9.7 installation, 91 backend tests, version/release-note validation, and Netlify function packaging pass. Tests verify separate Groq/OpenAI credentials and fixed audio hosts, Hebrew transcription configuration, and no automatic paid fallback when Groq is selected without its key.
- Browser conversation and rewards suites pass, including provider disclosure, reply controls at phone/desktop/keyboard sizes, recording, suggestions, retries and offline public assets. The resize assertion now waits for the browser's viewport event instead of reading a stale height immediately after resizing.
- Android 0.11.0 debug build, JVM tests and lint pass. Its built-in address is falachatapp.netlify.app; the explicit migration retains encrypted sessions only from this same site's former address. Physical installation/session migration still needs a phone check.
- Live synthetic Groq GPT-OSS 120B opening and continuation checks passed with Hebrew translations and answer ideas. Provider processing was roughly 2 seconds in that small sample. Rapid generation/repair also hit the account's 8,000-token-per-minute limit; quotas remain a real constraint, with retryable errors rather than paid OpenAI fallback. This is not a comprehensive language-quality or load test.
- One synthetic Portuguese clip was generated with the existing OpenAI voice and correctly transcribed by Groq Whisper large v3 turbo in about 3.1 seconds combined. No learner recording was used. Native Android continues to use its existing device speech services.
- No database migration is needed. The provider selectors were saved in Netlify; the new deployment activates them. Browser sign-in and notification permissions must be established on the new origin. Google console changes were reported complete by the owner; actual Google sign-in and physical phone behavior are not established by these tests.


## 0.12.0 — capoeira practice partners

- Clean npm 10.9.7 install, 93 backend tests and release build pass. Tests cover default/free selection, server-enforced unlocks at 200 and 500 earned XP, account isolation, migration reruns, older-client updates, conversation deletion and learning reset.
- Chromium checks pass at 320/360/390-pixel phone widths, desktop size and a 400-pixel keyboard viewport. Partner previews never select locked art; choices survive reload; everyday conversations omit portraits. Tests also cover opt-out, newly earned rewards without automatic selection, reduced-motion celebrations, sign-out cleanup and caching only public artwork.
- Android debug build, existing JVM tests and lint pass with the native collection, compact portrait and reward celebration. Physical-device visual checks and cross-device Google Play installation remain a device check.
- Source art is copied unchanged from the user’s CapoeiraMath Git history; provenance is in `assets/branding/instructors.md`. No extra AI calls or provider settings are introduced.
