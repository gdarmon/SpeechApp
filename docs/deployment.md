# Netlify + Supabase setup

This guide covers explicit Supabase/PostgreSQL configuration with Netlify Personal. If your current Netlify deployment uses its own Database/AI Gateway integration, reconcile those source changes before switching it to this branch. Building the repository does not create cloud projects. GitHub contains source and migrations, never your secrets.

## 1. Import into Netlify and check the region

Choose **Add new project → Import an existing project → GitHub**, then `gdarmon/SpeechApp`, branch `main`.

| Setting | Value |
|---|---|
| Base directory | Leave empty: repository root |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Functions directory | `netlify/functions` |
| Node version | 22.x, already configured |

These settings are in `netlify.toml`. The first build works before secrets exist: the landing page and `/health` work, while protected API requests report missing configuration. Android conversations require the remaining steps.

Open **Cloud compute → Functions → Region**. Current documentation says new sites default to **Ohio (`cmh`, AWS `us-east-2`)**. Region selection is available on **Pro and Enterprise**; the Personal configuration leaves it unset. Older sites can differ, so check the actual region. [Netlify function configuration](https://docs.netlify.com/build/functions/configuration/).

## 2. Create Supabase

1. Choose **New project**, name it `fala`, set a strong database password, and save it privately.
2. Select a **specific region** matching Netlify: normally **East US (Ohio), `us-east-2`** for a new Personal site. Avoid the broad automatic Americas choice if you want a precise match.
3. Wait for the project to be ready. Supabase Free is sufficient to begin initial testing.
4. Open **SQL Editor**, run all migration files in `supabase/migrations/` in filename order as the database owner. They create the private schema, Google accounts, device sessions, and per-user ownership, and repair JSON saved by older versions. Old single-learner records remain isolated in a legacy operator account.
5. Open **Connect**, select **Transaction pooler**, port **6543**, and copy its connection string. Replace the password placeholder with your database password, URL-encoding reserved characters if necessary. This is not the project HTTPS URL or an API key.

Illustrative shape only:

```text
postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@aws-0-us-east-2.pooler.supabase.com:6543/postgres
```

Use the exact host and username copied from **your project**; the host prefix may differ. The server uses TLS, one reusable connection per warm instance, and `prepare: false`, compatible with transaction pooling. [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [available regions](https://supabase.com/docs/guides/platform/regions).

Do not expose `fala` through the Data API or grant `anon`/`authenticated` access. The migration enables RLS and revokes their access. Netlify accesses the schema through the server-only database connection. Supabase Auth, Storage, publishable keys and service-role keys are not needed: Google ID tokens are verified by the API, which issues its own revocable device sessions.

## 3. Configure Netlify secrets

In **Project configuration → Environment variables**, add the following. Use **Functions** scope and **Production** context where available. If your plan only offers all scopes/contexts, use that setting and disable untrusted deploy previews. The application never copies these values into the public site. Do not commit `.env` or put secrets in `netlify.toml`.

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your transaction-pooler connection string |
| `GOOGLE_WEB_CLIENT_ID` | Public Web OAuth client ID from [Google setup](google-sign-in.md) |
| `FALA_TOKEN` | Optional random 32+ character **operator** token; never shared with users |
| `FALA_DAILY_USER_LIMIT` | Optional daily AI request limit per user; default 200 |
| `FALA_DAILY_APP_LIMIT` | Optional daily AI request limit for the whole service; default 2000 |
| `FALA_OPENAI_API_KEY` | OpenAI key for voice; also coaching only when selected |
| `FALA_OPENAI_MODEL` | Optional; defaults to `gpt-5.6-terra` |
| `FALA_DEMO` | `false` |

The paid option always uses `https://api.openai.com/v1`, with low reasoning effort and strict structured replies for the supported GPT-5.6 Terra/Sol/Luna models. Requests set `store: false`; provider abuse-monitoring retention is separate. [OpenAI model details](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [data controls](https://developers.openai.com/api/docs/guides/your-data).

To select paid OpenAI coaching, set `FALA_AI_PROVIDER=openai` with the dedicated OpenAI key. Set `FALA_TRANSCRIPTION_PROVIDER=openai` as well if you want OpenAI transcription. Without explicit provider selectors, adding the dedicated OpenAI key retains the previous behavior of selecting OpenAI. Fala never sends a failed conversation request to another provider automatically.

For lower-cost coaching with the same natural voice, set `FALA_AI_PROVIDER=groq`, `FALA_TRANSCRIPTION_PROVIDER=groq`, and `GROQ_API_KEY`. Retain `FALA_OPENAI_API_KEY` for speech generation only. `FALA_GROQ_MODEL` defaults to `openai/gpt-oss-120b`; transcription uses `whisper-large-v3-turbo`. An existing `OPENAI_API_KEY` with `OPENAI_BASE_URL=https://api.groq.com/openai/v1` supplies the Groq credential when the dedicated one is absent. Select `FALA_AI_PROVIDER=openai` explicitly to return coaching to OpenAI, or `compatible` to use the three generic settings. When the selector is absent, the old OpenAI-key precedence remains compatible.

Groq provides a [free tier with limits](https://console.groq.com/docs/rate-limits). Check the Groq account's plan and limits; Fala cannot guarantee unlimited or zero-cost use for a paid Groq account. No quota error silently triggers paid OpenAI coaching. [Groq transcription](https://console.groq.com/docs/speech-to-text) supports Portuguese and Hebrew. OpenAI voice generation remains billable. Voice and conversation requests have separate credentials and fixed provider hosts, and audio replays use the existing per-turn browser cache.

As of 19 September 2026, Terra lists $2 per million input tokens and $12 per million output tokens for standard short-context requests. Actual cost depends on conversation history, output/reasoning tokens and retries. The daily user/app allowances cap requests, not dollars; review actual API usage before opening access broadly. [Current model pricing](https://developers.openai.com/api/docs/models/gpt-5.6-terra).

Google sign-in is enabled through the Web and Android OAuth clients in [Google setup](google-sign-in.md). No Google client secret or email allowlist is required. Only set `FALA_TOKEN` if you want operator diagnostics or access to legacy records; generate a random value of at least 32 characters. App users never receive it.

Optional: `AI_TIMEOUT_MS=25000` (allowed 5000–35000); `DATABASE_CA_CERT` containing Supabase's PEM root certificate for explicit certificate verification. Literal `\n` sequences are accepted in the certificate value. Without a CA, the driver encrypts transport with `ssl: "require"`; supplying the CA also verifies the certificate. Leave `FALA_LOCAL_DATABASE` unset/false on Netlify.

Use a key for the configured provider. You can copy the adjacent chatbot's AI settings manually, but **do not copy its database connection**. This app has its own new database and does not require that local folder.

**Redeploy** after saving variables. Check the production deploy succeeds and the `api` function is listed. Environment and region changes need a new deploy.

## 4. Connect Android

Install the APK from GitHub Actions or a local build. Fala already knows `https://falachatapp.netlify.app`. Read the processing notice, choose the recognition preference, **sign in with Google**, and tap **Talk**. A publisher changing the deployment URL must rebuild Android with the new `API_BASE_URL` and update the Google web origin; users do not configure it.

Without an AI key, temporarily set `FALA_DEMO=true` and redeploy to check connectivity and phone audio. The app labels scripted mode and excludes it from progress. Set false again and start a new conversation for real practice.

## 5. Latency from Haifa

**On Personal, start with Ohio functions + Ohio Supabase.** This minimizes database trips between regions. Moving only the database to Frankfurt would make every database query cross the Atlantic. The nearby CDN serves static pages; dynamic conversations run in the configured function region.

**If you later obtain region selection, benchmark Frankfurt functions + Frankfurt Supabase.** This is a reasonable candidate for lower latency from Israel, not a measured guarantee. Netlify uses `fra`; Supabase uses `eu-central-1`. Move both together. A Supabase region change requires a new project and data migration, so plan that before moving an existing database. [Supabase regions](https://supabase.com/docs/guides/platform/regions).

The implementation reduces avoidable delays with one mobile request per spoken turn, one dashboard request, grouped context queries, pooled connections, 12 recent turns in the reply prompt, and short replies. Reasoning effort is low for the supported OpenAI models and Groq GPT-OSS. Conversation instructions are compact, with capoeira guidance included only for capoeira contexts. The AI deadline is below Netlify's 60-second synchronous limit. A transaction remains open during the bounded AI call to protect retries per learner. Locks are scoped to the user so different learners can progress independently across function instances. This has not been load-tested; measure database/pooler connection capacity before a broad launch.

To measure your Haifa connection, use Node 22 on a computer on the same network. In a local ignored `.env`, set `FALA_URL=https://YOUR-SITE.netlify.app` and `FALA_TOKEN`, then run:

```bash
npm run benchmark
```

Eight authenticated read-only checks report the region, database-region hint, round-trip time and server timing. They never print the token or call the AI. The first request may include cold-start/connection overhead; later requests do not guarantee future warm instances. Compare Wi-Fi and mobile data. Full speaking delay also includes recognition, AI generation and voice startup; follow [phone checks](device-checks.md).

Install a local pt-BR voice when available. Avoid artificial keep-alive requests: they consume usage and cannot guarantee latency. Supabase Free projects may pause after a week of inactivity; restore the project if needed. Pro avoids inactivity pausing, but upgrade only if you need it. [Supabase production guidance](https://supabase.com/docs/guides/deployment/going-into-prod).

Netlify Personal covers hosting allowances, not AI inference. Check actual usage after real sessions before changing plans. Enabling an OpenAI key starts metered API usage; it does not change the hosting or database plans.

## Troubleshooting

| Symptom | Check |
|---|---|
| Site builds but app cannot connect | Set production function variables and redeploy |
| “Run the Fala SQL migration” | Run the entire SQL file in the project used by `DATABASE_URL` |
| Database unavailable | Project running; transaction pooler host/username/password correct; password URL-encoded; port 6543 |
| Missing AI key | Key in function environment matches the provider endpoint |
| AI usage limit | Groq limits are shared across the account. Brief limits retry automatically within the AI deadline. Android and web can then retry one short provider limit (up to 30 seconds) with the same request ID and a visible waiting message; the overall client budget is 90 seconds. Longer or repeated limits return HTTP 429 with a provider-specific wait time. Keep the same reply and tap Retry after that delay. Higher capacity requires changing the provider plan, not Netlify or Supabase. |
| AI rejected/incomplete response | Provider quota, model availability and compatible JSON output; tap Retry |
| Processing conflict | Wait briefly and retry; avoid competing sessions |
| No Brazilian speech | Install pt-BR in Android voice settings |
| APK update refused | Different debug signing keys; use the original key or reinstall then sign in again |

`/health`, `/auth/config`, and the rate-limited Google sign-in endpoints are public. Learning/account routes require a user session. `/diagnostics` needs the optional operator token and reports no credentials or transcripts. Application errors avoid raw SQL/provider logs. Rate-limit diagnostics record only the provider host, model and retry delay, never API keys, transcripts or provider error bodies. Database backups and upstream retention remain separate from in-app deletion.
