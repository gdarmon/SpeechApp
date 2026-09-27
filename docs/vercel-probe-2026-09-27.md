# Vercel probe deployment and initial measurement — 27 September 2026

## Current result

The isolated probe is deployed and reachable. Health and route/authentication checks work. **No Vercel AI burst or full conversation test has run.** The owner supplied the runtime credentials and subsequently updated `DATABASE_URL`, but the deployed database check still reports `hostname_not_found`. The subsequently supplied direct-connection hostname was checked and has IPv6 only; select the actual Transaction pooler connection in Supabase before continuing. Resolve this setup problem before interpreting Vercel as a replacement for the current hosting service.

The application's Netlify production deployment was separately confirmed to remain `6ab79231ad32f40008ab8dbe`, version 0.14.3. No phone, website learner route, reminder job or production provider was moved. No paid hosting plan was purchased.

## Deployment identity

| Item | Verified value |
|---|---|
| Vercel account/team | `gdarmon-4173`, Hobby |
| Project | `fala-latency-probe`, `prj_PiS7WiHFt7ncIDa8vBRx2BE4ga3j` |
| CLI | Official Vercel CLI 60.1.3, signed in using its browser device flow |
| Workstation CLI path | `.tools/vercel-cli/node_modules/.bin/vercel` (ignored) |
| Prepared upload directory on this workstation | `artifacts/vercel-probe-v3qMwt` (ignored; regenerate from source on a new machine) |
| Source | `8a5eec0`, including fixed-category connection diagnostics |
| Runtime | Node 22.x; Fluid Compute enabled |
| Function deployment region | `cle1` (reported by the actual deployment, despite the project-level default being `iad1`) |
| Latest checked deployment | `dpl_Bu2ah2yHZK6sU8bbPcvLe6A5EhGT`, `https://fala-latency-probe-12q01mcgb-gdarmon-4173.vercel.app` |
| Project alias | `https://fala-latency-probe-gdarmon-4173.vercel.app` |
| Repository link | None; manual upload of the prepared directory |

The latest checked deployment was created at 08:35:14 UTC and reached Ready, with a reported 50-second build. The CLI's immediate `--no-wait` output also used the word "ready" while `readyState` was `INITIALIZING`; actual readiness was verified separately using `vercel inspect --wait`. Build machine CPU/memory are not measurements of function runtime capacity.

The nine operator/model/limit settings were set through the authorized CLI; the operator token was supplied via stdin as a sensitive variable. The owner supplied `FALA_OPENAI_API_KEY` and `DATABASE_URL` directly in Vercel. Netlify's existing configuration returned unusable masked placeholders; no credentials were reconstructed or extracted through application code. The upload inspection listed 29 files and excluded generated `.env.local`, `.vercel` and local `.gitignore` state.

Vercel SSO initially intercepted the probes with HTTP 302. Automatic review rejected disabling it without explicit consent. The owner then explicitly approved removing that extra login requirement **only for this diagnostic project**, and the change succeeded. The application still requires the operator token for diagnostics and blocks learner routes. This approval does not extend to any other project.

## Functional and connection checks

- `/health` and `/api/health`: HTTP 200, `{status: "ok"}` and timing headers.
- Unauthenticated `/diagnostics`: HTTP 401.
- `/sessions`, even with the operator token: HTTP 404.
- Authenticated `/diagnostics`: HTTP 503 during database ping; the shared API returns its generic failure message.
- The isolated adapter records only `{event: "fala_probe_database_failure", category: "hostname_not_found"}` for the connection failure. This was observed before and after the owner's first connection-string correction. The latter request spent 19.6 ms in the measured DB span, 23.8 ms in the handler. No AI call occurred.

DNS failure is not evidence that the password is wrong. The owner was asked for only the hostname portion and supplied a direct-connection template on port 5432. A public DNS check of that host found **no A record (`ENODATA`) and one AAAA record**. This is consistent with the deployed resolution failure on an IPv4-only path. Supabase documents the [direct connection's IPv6 default and the IPv4-compatible shared pooler](https://supabase.com/docs/guides/database/connecting-to-postgres). This evidence does not prove any password has been accepted. The supplied template also contained `[YOUR-PASSWORD]`; the actual hosting setting must contain the existing database password, with reserved characters encoded, without disclosing it in chat.

Use the Supabase project's **Connect → Transaction pooler** selection (port 6543), not **Direct connection** or the HTTPS Data API URL. Copy the actual hostname and pooled username; neither should be guessed from the region or project URL. Preserve the working production database password. See the [setup runbook](hosting-comparison.md).

The Netlify baseline's authorized diagnostics succeeded and reported OpenAI `gpt-5.6-luna`, database/function region `us-east-2`, live mode, 8,000 ms AI timeout, and both daily allowances disabled. Its `src`, Netlify function and package files have no diff between deployed source `b7b99d8` and this branch's source. The Vercel model settings are configured to match, but successful database and provider checks remain prerequisites for the AI comparison.

## Health-only comparison

The existing HTTP/1.1 keep-alive collector sent two successive waves of 50 GET `/health` requests from the same workstation to each isolated deployment. Health skips configuration, SQL and AI. All 200 requests returned valid successful responses.

| Host | Wave | Success | Client p50 | Client p95 | Maximum |
|---|---:|---:|---:|---:|---:|
| Vercel | 1 | 50/50 | 1,161.8 ms | 1,204.7 ms | 1,239.9 ms |
| Vercel | 2 | 50/50 | 184.6 ms | 220.1 ms | 280.0 ms |
| Netlify | 1 | 50/50 | 1,799.0 ms | 2,124.6 ms | 2,276.9 ms |
| Netlify | 2 | 50/50 | 426.0 ms | 678.9 ms | 805.1 ms |

Vercel run: **08:34:53.072–08:34:54.620 UTC**, deployment `dpl_Ey9CUB3Hi3fY5pdDfD2SZD3D26QV` (`fala-latency-probe-pimev4nn3-gdarmon-4173.vercel.app`). Netlify run: **08:35:28.401–08:35:31.521 UTC**, existing isolated deployment `6ab8bc51dac313ca33edcc46`.

Wave two reused client connections; health intentionally does not expose runtime instance metadata, so these reports do not prove function-instance reuse. These are sequential, single runs with no randomized order. The result supports a faster basic hosting path in this sample, not a claim that AI conversations meet the three-second target or that 50 learners are supported. Netlify's previously reproduced long AI-request tail remains a separate measured result.

Ignored local raw timing reports, without credentials or generated/learner text:

- `artifacts/latency-health-50-1790498094620.json` — Vercel.
- `artifacts/latency-health-50-1790498131521.json` — Netlify.

## Validation and continuation

199 local tests across 17 files and the normal build passed. The new log test verifies only fixed categories are emitted and that errors, query parameters, driver messages and private sentinel values cannot be copied into logs. Vercel built and served the staged TypeScript function successfully.

The hostname check is complete. Continue when the owner saves the actual Transaction pooler URI in Vercel's Production `DATABASE_URL`, redeploy those settings, verify authorized `/diagnostics`, then make one synthetic AI request. Only after that succeeds, run the matched 50-request AI waves described in the [comparison runbook](hosting-comparison.md), observing the shared 120/minute operator flood guard. Keep real learner migration separate from this experiment; the existing one-connection pool still needs review under shared-process concurrency.
