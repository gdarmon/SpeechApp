# Isolated Vercel hosting comparison

Status on 27 September 2026: the operator-only adapter and preparation script are implemented and locally tested. **No Vercel deployment or Vercel latency measurement has been completed.** This workstation had no Vercel CLI, linked project or login in the standard CLI configuration locations. Account access and securely configured runtime credentials are required to complete the comparison. Fala users continue to use Netlify 0.14.3.

## Why this experiment

The [invocation-reuse experiment](latency-invocation-reuse-2026-09-27.md) measured a 4.12-second delay reported before function execution on an application's third invocation. Even the entirely reused second wave had p50 3.49 seconds and p95 4.23 seconds. Application initialization is insufficient to explain that result. A controlled alternative-host test is more useful than assuming a paid Netlify plan or a virtual machine will fix it.

The test reuses `createHandler`, the fixed synthetic `/diagnostics/ai` request, configured provider/model, database, timing headers and invocation observations. Vercel adds only its Web Standard adapter and an operator/route guard. The probe cannot serve login, learner history, conversations, speech, rewards or account mutations. It rejects learner credentials before the shared handler can look them up. The existing synthetic probe does update its rate-limit accounting; it does not create learner conversations.

This is a hypothesis test, not a recommendation to migrate based on platform marketing. Vercel [Fluid Compute](https://vercel.com/docs/fluid-compute) can handle multiple invocations in one instance. Its documented bytecode caching applies to production deployments, not previews. Use the production environment of a **separate diagnostics project**, not Fala's user-facing site or domain. The deployment selects [Cleveland `cle1`](https://vercel.com/docs/functions/configuring-functions/region), close to the current Ohio database. Record the actual returned region instead of assuming the configuration was applied.

## Prepare the upload

Use the repository's Node 22.22.2 / npm 10.9.7 toolchain:

```bash
npx --yes npm@10.9.7 ci
npx --yes npm@10.9.7 test
npx --yes npm@10.9.7 run build
node scripts/prepare-vercel-probe.mjs
```

The last command prints a fresh absolute directory under ignored `artifacts/vercel-probe-*`. That directory is the Vercel project root. It contains only `.ts` sources from `src` and `deploy/vercel-probe`, package metadata/lockfile, a scoped TypeScript configuration, one catch-all function, reviewed routing configuration and a minimal diagnostic landing page. Hidden files, symlinks, `.env`, existing deployment state, `.tools`, Android signing material, reports and the normal web application are not copied. Never upload the whole workstation checkout as a substitute.

The prepared project uses `deploy/vercel-probe/vercel.json`: Node runtime selected by package engines, Fluid enabled, region `cle1`, 30-second function deadline, npm 10.9.7 installation and TypeScript checking. The application AI deadline remains eight seconds. No app version or Play upload is needed for this private diagnostic experiment.

## Connect the account and deploy

1. Sign in to the intended Vercel account using its official CLI login. Use normal account authorization; never paste credentials into a chat or search other projects for them. Record the CLI version used. If the selected account requires a new paid plan, review its actual terms/cost with the owner before purchasing.
2. In the generated directory, use `vercel link` to create/link a **new** project such as `fala-latency-probe`, with framework **Other** and that directory as its root. Do not link the live Fala project or connect user-facing domains. Keep the generated configuration overrides.
3. Add the following variables to that project's **Production** environment using the secure dashboard or interactive `vercel env add NAME production`. Do not place values in command arguments, checked-in files or screenshots. Use authorized existing account credentials or newly scoped credentials created by the owner. Masked Netlify values cannot be recovered by these scripts.

   | Variable | Value/purpose |
   |---|---|
   | `FALA_TOKEN` | Strong operator token, at least 32 characters; the test runner must use the matching value |
   | `DATABASE_URL` | The same Supabase transaction-pooler database as the baseline, supplied securely |
   | `DATABASE_CA_CERT` | Same CA configuration as the baseline, if present |
   | `FALA_OPENAI_API_KEY` | Authorized key for the same OpenAI account/project as the baseline |
   | `FALA_AI_PROVIDER` | `openai` |
   | `FALA_OPENAI_MODEL` | `gpt-5.6-luna`, or the verified baseline value if it has changed |
   | `FALA_AI_FALLBACK_PROVIDER` | `none` for this primary-only comparison |
   | `FALA_DAILY_USER_LIMIT` | `0` |
   | `FALA_DAILY_APP_LIMIT` | `0` |
   | `AI_TIMEOUT_MS` | `8000` |
   | `FALA_DEMO` | `false` |
   | `FALA_LOCAL_DATABASE` | `false` |

   Google login, Groq backup, audio and push credentials are unnecessary: this first comparison uses `route: primary` and blocks learner routes. This configuration is for the separate probe, not a change to production's approved backup routing.
4. Deploy from that generated directory using `vercel deploy --prod`. Here `--prod` refers only to the separate diagnostics project and enables the platform's production optimizations. Record project, deployment URL/ID, region, Node version and source commit. Do not report publication until deployment succeeds.
5. Check `/health`, an unauthenticated `/diagnostics` rejection, and authenticated `/diagnostics` before any AI burst. Confirm real mode, provider, model, database region hint, timeout and limits. Check blocked learner routes return 404. If Vercel deployment protection intercepts requests, configure access only for this diagnostic project; the application operator guard must remain in place. The measurement runner deliberately does not follow login redirects.

## Run a fair comparison

Use an instrumented Netlify draft of the same commit for the baseline. Confirm both deployments' settings; a Netlify draft has previously inherited old provider settings even with a production build context. Do not copy secrets into generated source files. From the repository root, with the matching operator token securely loaded in the process environment:

```bash
FALA_URL=https://VERIFIED-PROBE-DEPLOYMENT \
FALA_LATENCY_TARGET=ai FALA_RUN_AI_PROBE=true \
FALA_PROBE_ROUTE=primary FALA_LATENCY_CONCURRENCY=50 \
FALA_LATENCY_WAVES=2 FALA_LATENCY_MAX_P95_MS=3000 \
node --env-file-if-exists=.env scripts/check-latency.mjs
```

Substitute the verified HTTPS host; the placeholder is not a deploy target. Start with one AI request to verify the route, then run the burst after allowing its rate-limit window to clear. Each two-wave run generates up to 100 billable synthetic replies. The shared account guard allows 120 calls/minute, including probes on both hosts. Leave at least 70 seconds between AI runs and ensure no competing operator probe is running. An operator token change does not create a new budget identity. Do not disable the flood guard for the comparison.

Run the same settings against each host from the same machine/network. If the initial comparison warrants it, repeat in reverse order to control provider/time-order variation. Compare each wave separately: overall p50/p95/max, all failures, AI/DB/handler spans, client socket queue and connection setup, outside-handler residual, and confirmed instance reuse. The residual is not itself a measured hosting queue. Netlify's separate Observability collector provides its platform spans; it does not work with Vercel IDs. The HTTP/1.1 and HTTP/2 collectors retain bounded `x-vercel-id` values tagged `request_platform: vercel` for Vercel log correlation.

The runner exits 1 for failed/invalid requests and 2 if a wave misses its p95 target, even when every response is HTTP 200. No automatic retry hides failures. Store a dated, sanitized report in maintained documentation; do not publish keys, learner/generated text, raw logs or client identifiers.

## Decision and migration boundary

- A promising hosting comparison needs all requests to succeed and p95 below three seconds in repeated runs, with lower outside-handler time rather than merely faster AI that day. A single passing burst does not guarantee that no user ever waits three seconds.
- If both hosts remain slow, use their request IDs and component spans to investigate the remaining path. Do not migrate or buy a larger plan on an unmeasured assumption.
- If Vercel improves this probe, the next gate is a full conversation check with isolated test learners and realistic staggered traffic, including voice. **Do not point existing clients at this adapter.**
- `connectDatabase` currently permits one connection per process. Real turns hold a per-account transaction across generation. A multi-invocation process could therefore serialize different learners through the same connection. The synthetic probe uses a short budget transaction before generation, so it cannot validate that real-session contention. Review database pool capacity/transaction ownership and test account isolation/idempotency before enabling learner traffic; do not remove account locks or arbitrarily increase the pool to 50.
- Once evidence supports a migration, handle client base URLs, Google auth/cookies, reminders, secrets, rollback and native distribution as a separate reviewed release. This experiment changes none of those.

## Local validation

The local suite passed 198 tests across 17 files, including route/credential isolation and 50 concurrent adapter calls with immutable invocation snapshots. HTTP/1.1 and HTTP/2 loopback fixtures verify Vercel request-ID collection. The normal build, prepared project's type check, upload file allowlist inspection and validation against Vercel's current official JSON Schema (draft 4) passed. These mocked/local checks establish behavior, not Vercel packaging, live throughput or latency; those remain pending account access and deployment.
