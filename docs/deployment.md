# Netlify + Supabase setup

This guide starts with no Supabase project and a Netlify Personal account. Building the repository does not create cloud projects. GitHub contains source and migrations, never your secrets.

## 1. Import into Netlify and check the region

Choose **Add new project → Import an existing project → GitHub**, then `gdarmon/SpeechApp`, branch `main`.

| Setting | Value |
|---|---|
| Base directory | Leave empty: repository root |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Functions directory | `netlify/functions` |
| Node version | 22.22.2, already configured |

These settings are in `netlify.toml`. The first build works before secrets exist: the landing page and `/health` work, while protected API requests report missing configuration. Android conversations require the remaining steps.

Open **Cloud compute → Functions → Region**. Current documentation says new sites default to **Ohio (`cmh`, AWS `us-east-2`)**. Region selection is available on **Pro and Enterprise**; the Personal configuration leaves it unset. Older sites can differ, so check the actual region. [Netlify function configuration](https://docs.netlify.com/build/functions/configuration/).

## 2. Create Supabase

1. Choose **New project**, name it `fala`, set a strong database password, and save it privately.
2. Select a **specific region** matching Netlify: normally **East US (Ohio), `us-east-2`** for a new Personal site. Avoid the broad automatic Americas choice if you want a precise match.
3. Wait for the project to be ready. Supabase Free is sufficient to begin testing this private app.
4. Open **SQL Editor**, paste the entire [migration](../supabase/migrations/202609180001_fala.sql), and run it as the default database owner. It creates four tables in the private `fala` schema. Rerunning this initial migration does not clear your data.
5. Open **Connect**, select **Transaction pooler**, port **6543**, and copy its connection string. Replace the password placeholder with your database password, URL-encoding reserved characters if necessary. This is not the project HTTPS URL or an API key.

Illustrative shape only:

```text
postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@aws-0-us-east-2.pooler.supabase.com:6543/postgres
```

Use the exact host and username copied from **your project**; the host prefix may differ. The server uses TLS, one reusable connection per warm instance, and `prepare: false`, compatible with transaction pooling. [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [available regions](https://supabase.com/docs/guides/platform/regions).

Do not expose `fala` through the Data API or grant `anon`/`authenticated` access. The migration enables RLS and revokes their access. Netlify accesses the schema through the server-only database connection. Supabase Auth, Storage, publishable keys and service-role keys are not needed for this single-learner app.

## 3. Configure Netlify secrets

In **Project configuration → Environment variables**, add the following. Use **Functions** scope and **Production** context where available. If your plan only offers all scopes/contexts, use that setting and disable untrusted deploy previews. The application never copies these values into the public site. Do not commit `.env` or put secrets in `netlify.toml`.

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your transaction-pooler connection string |
| `FALA_TOKEN` | Random private device token, at least 32 characters |
| `OPENAI_API_KEY` | Your **Groq** key for the default provider |
| `OPENAI_BASE_URL` | `https://api.groq.com/openai/v1` |
| `OPENAI_MODEL` | `openai/gpt-oss-120b` |
| `FALA_DEMO` | `false` |

Generate a token locally, then copy it into Netlify and Android's connection settings:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

The token grants access to this learner's conversations, including deletion. It is **not** the AI key or database password. To revoke a lost device, replace it in Netlify, redeploy, and update your remaining device.

Optional: `AI_TIMEOUT_MS=25000` (allowed 5000–35000); `DATABASE_CA_CERT` containing Supabase's PEM root certificate for explicit certificate verification. Literal `\n` sequences are accepted in the certificate value. Without a CA, the driver encrypts transport with `ssl: "require"`; supplying the CA also verifies the certificate. Leave `FALA_LOCAL_DATABASE` unset/false on Netlify.

Use a key for the configured provider. You can copy the adjacent chatbot's AI settings manually, but **do not copy its database connection**. This app has its own new database and does not require that local folder.

**Redeploy** after saving variables. Check the production deploy succeeds and the `api` function is listed. Environment and region changes need a new deploy.

## 4. Connect Android

Install the APK from GitHub Actions or a local build. In Fala, enter:

- Server address: `https://YOUR-SITE.netlify.app`, or your HTTPS custom domain.
- Device token: the exact `FALA_TOKEN` above.

Use the site root, with no `/.netlify/functions/...` suffix. An `/api` prefix also works. Read the processing notice, select recognition preference, connect, and tap **Talk**.

Without an AI key, temporarily set `FALA_DEMO=true` and redeploy to check connectivity and phone audio. The app labels scripted mode and excludes it from progress. Set false again and start a new conversation for real practice.

## 5. Latency from Haifa

**On Personal, start with Ohio functions + Ohio Supabase.** This minimizes database trips between regions. Moving only the database to Frankfurt would make every database query cross the Atlantic. The nearby CDN serves static pages; dynamic conversations run in the configured function region.

**If you later obtain region selection, benchmark Frankfurt functions + Frankfurt Supabase.** This is a reasonable candidate for lower latency from Israel, not a measured guarantee. Netlify uses `fra`; Supabase uses `eu-central-1`. Move both together. A Supabase region change requires a new project and data migration, so plan that before moving an existing database. [Supabase regions](https://supabase.com/docs/guides/platform/regions).

The implementation reduces avoidable delays with one mobile request per spoken turn, one dashboard request, grouped context queries, pooled connections, 12 recent turns in the reply prompt, short replies, and low reasoning effort for Groq GPT-OSS. The AI deadline is below Netlify's 60-second synchronous limit. A transaction remains open during the bounded AI call to protect retries for this private app; redesign that coordination before serving many learners.

To measure your Haifa connection, use Node 22 on a computer on the same network. In a local ignored `.env`, set `FALA_URL=https://YOUR-SITE.netlify.app` and `FALA_TOKEN`, then run:

```bash
npm run benchmark
```

Eight authenticated read-only checks report the region, database-region hint, round-trip time and server timing. They never print the token or call the AI. The first request may include cold-start/connection overhead; later requests do not guarantee future warm instances. Compare Wi-Fi and mobile data. Full speaking delay also includes recognition, AI generation and voice startup; follow [phone checks](device-checks.md).

Install a local pt-BR voice when available. Avoid artificial keep-alive requests: they consume usage and cannot guarantee latency. Supabase Free projects may pause after a week of inactivity; restore the project if needed. Pro avoids inactivity pausing, but upgrade only if you need it. [Supabase production guidance](https://supabase.com/docs/guides/deployment/going-into-prod).

Netlify Personal covers hosting allowances, not AI inference. Check actual usage after real sessions before changing plans. No paid upgrades are configured.

## Troubleshooting

| Symptom | Check |
|---|---|
| Site builds but app cannot connect | Set production function variables and redeploy |
| “Run the Fala SQL migration” | Run the entire SQL file in the project used by `DATABASE_URL` |
| Database unavailable | Project running; transaction pooler host/username/password correct; password URL-encoded; port 6543 |
| Missing AI key | Key in function environment matches the provider endpoint |
| AI rejected/incomplete response | Provider quota, model availability and compatible JSON output; tap Retry |
| Processing conflict | Wait briefly and retry; avoid competing sessions |
| No Brazilian speech | Install pt-BR in Android voice settings |
| APK update refused | Different debug signing keys; use the original key or reinstall after saving connection settings |

Only `/health` is public. `/diagnostics` needs the device token and reports no credentials or transcripts. Application errors avoid raw SQL/provider logs. Database backups and upstream retention remain separate from in-app deletion.
