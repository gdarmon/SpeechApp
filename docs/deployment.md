# Vercel + PostgreSQL setup

The live deployment is the full website/API at `https://fala-api.vercel.app`, project **fala-api**, team **gdarmon-4173**. Use the [release runbook](releasing.md) for staging, deployment, verification and rollback, and the [latest receipt](releases/0.15.0.md) for actual cutover status. A successful upload is not proof of the performance target or Play availability.

## Existing account and database

Preserve the current Fala PostgreSQL database and private `fala` schema. A hosting change does not require copying learner data or creating another database. For a genuinely new installation, use the owner's chosen PostgreSQL/Supabase project and apply `supabase/migrations/*.sql` in filename order. For an existing database apply only missing reviewed migrations.

Use Supabase **Connect → Transaction pooler**, port **6543**, with the exact host, username and URL-encoded password from that project. The HTTPS project URL and the direct `db.PROJECT.supabase.co:5432` connection are not substitutes. Keep this connection server-side. Never paste it into chat or source. The driver uses TLS, `prepare: false`, one reusable connection per instance, a 60-second idle timeout and 300-second maximum lifetime. Generation claims allow AI work outside database transactions.

The schema has RLS and denies `anon`/`authenticated` table access. Fala verifies Google ID tokens itself and issues hashed, revocable device sessions. It does not use the public Supabase Data API, service-role keys or Supabase Auth for learner login.

## Production environment

Configure values only in the authorized Vercel project's **Production environment variables**, then deploy again. Existing values were moved with the owner's explicit permission. A fresh machine needs its own authorized login; do not search another project for credentials.

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your transaction-pooler connection string |
| `GOOGLE_WEB_CLIENT_ID` | Public Web OAuth client ID from [Google setup](google-sign-in.md) |
| `FALA_TOKEN` | Optional random 32+ character **operator** token; never shared with users |
| `FALA_DAILY_USER_LIMIT` | Optional daily AI request limit per user; default 200; `0` disables |
| `FALA_DAILY_APP_LIMIT` | Optional daily AI request limit for the whole service; default 2000; `0` disables |
| `FALA_OPENAI_API_KEY` | OpenAI key for voice; also coaching only when selected |
| `FALA_OPENAI_MODEL` | Optional; defaults to `gpt-5.6-terra` |
| `FALA_DEMO` | `false` |
| `FALA_AI_PROVIDER` | Current explicit primary: `openai` |
| `FALA_AI_FALLBACK_PROVIDER` | Current explicit backup: `groq` |
| `GROQ_API_KEY` | Existing authorized Groq credential |
| `FALA_TRANSCRIPTION_PROVIDER` | Current web transcription: `openai` |
| `FALA_AI_HEDGE_MS` | Current 5000 ms; immediate failover on primary errors still applies |
| `AI_TIMEOUT_MS` | Current shared deadline: 8000 ms |
| `FALA_VAPID_PUBLIC_KEY`, `FALA_VAPID_PRIVATE_KEY` | Matching Web Push key pair; private key never in source/client assets |
| `FALA_REMINDER_TOKEN` | Dedicated random 32+ character secret, also configured in GitHub Actions |
| `FALA_SESSION_DIAGNOSTICS` | Off normally; temporary explicit opt-in for isolated synthetic load tests |

The current model is explicitly `gpt-5.6-luna`; defaults are not evidence of production configuration. Daily user/application allowances are currently `0` by owner authorization. The per-account flood guard remains. Provider billing/throughput limits still apply: disabling an app quota does not enlarge provider capacity. Review [service reliability](service-reliability.md) before increasing traffic or changing routes. Requests use the configured fixed provider endpoints; fallback must be explicitly authorized/configured.

Google's existing **Fala backend** Web OAuth client needs the exact authorized JavaScript origin `https://fala-api.vercel.app` without a path. Keep the legacy Netlify origin during transition. No Google client secret is needed. Existing Android OAuth clients and the `com.fala.app` signing identity remain unchanged.

## Deploy and verify

Follow the staged CLI deployment in [releasing.md](releasing.md#vercel-primary-deployment). The stage includes public files, the TypeScript API and its Vercel adapter; never deploy the whole workstation checkout. The configured function region is `cle1` with Node 22 and Fluid. The existing database location was preserved. Region labels and paid plans alone do not prove faster responses.

Verify `/health`, the visible web version and service worker, Google button loading, unauthenticated account rejection and the changed authenticated behavior. `/health` alone does not check AI or database health. Operator-only `/diagnostics` reports configuration/timing without credentials or learner transcripts. Synthetic AI checks are billable and explicitly enabled; see the measured scope in the release receipt.

For reminders, the GitHub Actions `reminders.yml` workflow calls `/internal/reminders` every 15 minutes using its dedicated secret. This is best effort, not an exact-time alarm. Notification permission and a subscription matching the current VAPID key are required. Keep account opt-outs, custom times, same-day-practice suppression and delivery deduplication. Do not run the retired Netlify scheduler alongside it. The new matching VAPID pair is already configured in Vercel Production; retain it for future deployments. See [reminder operations](reminders.md) for key handling, reconnection and troubleshooting.

## Existing clients and local development

Android 0.14.4 targets Vercel directly and preserves its encrypted device login when moving from an explicitly approved old Fala origin. A new Play installation/update still requires the normal signed publication workflow.

Netlify remains only transitional compatibility: API routes proxy to Vercel and website visits redirect. The old `/app/sw.js` serves a local retirement worker, since a worker update cannot follow a cross-origin redirect. It clears only Fala shell caches and unregisters without navigating an open draft; the next visit moves to the new site. Browser cookies and notification permission belong to their origin, so the new website requires login/permission again. Keep the legacy proxy until old client versions can be retired.

`npm run dev` compiles the API into ignored `.netlify/dev-build` and starts a loopback-only server at `http://127.0.0.1:8888/app/`. It reads the local ignored `.env`, never cloud settings or production redirect rules. Use an authorized development database, `FALA_LOCAL_DATABASE=true` only for loopback PostgreSQL, and register the local Google origin if testing login. `FALA_DEV_PORT` changes the port. Restart after backend edits; static files are read directly. Scripted `FALA_DEMO=true` is explicitly labeled and is not real teaching or performance evidence.
