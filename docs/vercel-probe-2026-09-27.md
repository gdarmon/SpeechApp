# Vercel deployment and AI hosting comparison — 27 September 2026

## Current result

The owner's Transaction pooler update resolved database access. The isolated Vercel probe now serves authenticated synthetic AI requests, with the same shared handler and configured model as the Netlify baseline. The comparison below separates generation time from the remaining request path. A full learner conversation or voice-capacity test has not run on Vercel.

All 400 requests succeeded in the repeated, reversed-order comparison. Second-wave p95 was **2.40–2.45 seconds on Vercel versus 4.01–4.12 on Netlify**, with similar generation medians. The first Vercel wave still missed the three-second gate, so this is evidence for a further full-conversation experiment rather than a completed user-facing fix.

The application's Netlify production deployment was separately confirmed to remain `6ab79231ad32f40008ab8dbe`, version 0.14.3. No phone, website learner route, reminder job or production provider was moved. No paid hosting plan was purchased.

## Deployment identity

| Item | Verified value |
|---|---|
| Vercel account/team | `gdarmon-4173`, Hobby |
| Project | `fala-latency-probe`, `prj_PiS7WiHFt7ncIDa8vBRx2BE4ga3j` |
| CLI | Official Vercel CLI 60.1.3, signed in using its browser device flow |
| Workstation CLI path | `.tools/vercel-cli/node_modules/.bin/vercel` (ignored) |
| Prepared upload directory on this workstation | `artifacts/vercel-probe-v3qMwt` (ignored; regenerate from source on a new machine) |
| Source | `126b738`, including fixed-category connection diagnostics and concrete function routing |
| Runtime | Node 22.x; Fluid Compute enabled |
| Function deployment region | `cle1` (reported by the actual deployment, despite the project-level default being `iad1`) |
| AI comparison deployment | `dpl_AVf9xeR6YpsTK4iQ7cdZzZhPgiS2`, `https://fala-latency-probe-hqcfnr89g-gdarmon-4173.vercel.app` |
| Project alias | `https://fala-latency-probe-gdarmon-4173.vercel.app` |
| Repository link | None; manual upload of the prepared directory |

The comparison deployment was created at 08:51:16 UTC and reached Ready, with a reported 45-second build. The CLI's immediate `--no-wait` output also used the word "ready" while `readyState` was `INITIALIZING`; actual readiness was verified separately using `vercel inspect --wait`. The packaged function is `api/probe` in `cle1`. Build machine CPU/memory are not measurements of function runtime capacity.

The nine operator/model/limit settings were set through the authorized CLI; the operator token was supplied via stdin as a sensitive variable. The owner supplied `FALA_OPENAI_API_KEY` and `DATABASE_URL` directly in Vercel. Netlify's existing configuration returned unusable masked placeholders; no credentials were reconstructed or extracted through application code. The upload inspection listed 29 files and excluded generated `.env.local`, `.vercel` and local `.gitignore` state.

Vercel SSO initially intercepted the probes with HTTP 302. Automatic review rejected disabling it without explicit consent. The owner then explicitly approved removing that extra login requirement **only for this diagnostic project**, and the change succeeded. The application still requires the operator token for diagnostics and blocks learner routes. This approval does not extend to any other project.

## Functional and connection checks

- `/health`: HTTP 200, `{status: "ok"}` and timing headers.
- Unauthenticated `/diagnostics`, POST `/diagnostics/ai` and the concrete AI entrypoint: HTTP 401.
- `/sessions`, even with the operator token: HTTP 404.
- Authenticated `/diagnostics`: HTTP 200, database ready, OpenAI `gpt-5.6-luna`, live mode, function `cle1`, database region hint `us-east-2`, eight-second AI deadline and disabled daily allowances. After the owner's pooler update, the first successful check measured 100.1 ms DB / 104.6 ms handler; after the routing redeployment it measured 77.2 / 81.6 ms.
- Preliminary single AI request: HTTP 200 and a valid synthetic response, 3,571.6 ms client / 2,850.8 ms handler / 2,757.3 ms AI / 88.2 ms DB. Its latency gate failed even though functionality succeeded. Local report: `artifacts/latency-ai-1-1790499194426.json`.

### Resolved setup failures

Earlier deployments returned HTTP 503 during the database ping. The isolated adapter recorded only `{event: "fala_probe_database_failure", category: "hostname_not_found"}`, never SQL, credentials or raw driver text. The owner's first correction still failed; the subsequent Transaction pooler update and redeployment succeeded without resetting the working database password.

The direct-connection hostname supplied during diagnosis had **no A record (`ENODATA`) and one AAAA record**. This was consistent with the deployed resolution failure on an IPv4-only path, not evidence of a wrong password. Supabase documents the [direct connection's IPv6 default and the IPv4-compatible shared pooler](https://supabase.com/docs/guides/database/connecting-to-postgres). The later successful SQL check establishes that the updated connection is usable.

Use the Supabase project's **Connect → Transaction pooler** selection (port 6543), not **Direct connection** or the HTTPS Data API URL. Copy the actual hostname and pooled username; neither should be guessed from the region or project URL. Preserve the working production database password. See the [setup runbook](hosting-comparison.md).

After database access succeeded, the initial catch-all function returned Vercel `404 NOT_FOUND` for POST `/diagnostics/ai`, before our handler ran. This was a routing defect in the probe, not an AI failure. Commit `126b738` uses a concrete `api/probe.ts` entrypoint with three allowlisted rewrites and preserves the POST body. Local regression and deployed rejection/success checks cover this path. The failed one-request setup report is `artifacts/latency-ai-1-1790498862647.json`; it produced no AI response and is not part of the successful load comparison.

The Netlify baseline's authorized diagnostics succeeded and reported OpenAI `gpt-5.6-luna`, database/function region `us-east-2`, live mode, 8,000 ms AI timeout, and both daily allowances disabled. Its `src`, Netlify function and package files have no diff between deployed source `b7b99d8` and Vercel source `126b738`. Provider responses confirm the same endpoint and model. The owner supplied the Vercel key securely; its OpenAI account identity was not independently inspected. Both probes use the primary route, so production's configured Groq backup does not affect this comparison.

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

200 local tests across 17 files and the normal build passed. Regression checks cover concrete routing, POST-body preservation, authentication, blocked learner routes and fixed-category logs that exclude errors, query parameters, driver messages and private sentinel values. Vercel built and served the staged TypeScript function successfully.

The setup and bounded synthetic comparison are complete. The next gate is a full conversation experiment with isolated test learners and realistic staggered traffic, including voice. The existing one-connection pool and transactions held across AI generation need review under multi-invocation hosting before enabling learner traffic. Do not change production client URLs or disable account locks based on this probe. See the [comparison runbook](hosting-comparison.md).

## AI comparison: 400 successful requests, repeated in reverse host order

Each run sent two immediate waves of 50 concurrent fixed synthetic requests using HTTP/1.1 keep-alive from the same workstation. Run order was Vercel A → Netlify B → Netlify C → Vercel D, with at least 70 seconds after each completed run to preserve the shared 120/minute operator guard. The first pair's improvement justified the reverse-order repetition. This is four bounded bursts, not sustained learner traffic or randomized long-term sampling.

Every request returned HTTP 200 with a valid synthetic response: **200/200 on each host**, with no retries, provider errors or quota responses. Every provider observation used `api.openai.com`, `gpt-5.6-luna`, 2,828 input tokens and 103–126 output tokens. The comparison uses generated structured replies, not transcripts or learner history. All 200 Netlify IDs matched read-only Observability details.

| Run / host | UTC interval | Local report under ignored `artifacts/` |
|---|---|---|
| A / Vercel | 08:57:06.541–08:57:13.551 | `latency-ai-50-1790499433551.json` |
| B / Netlify | 08:58:42.148–08:58:54.052 | `latency-ai-50-1790499534052.json` |
| C / Netlify | 09:00:41.253–09:00:55.106 | `latency-ai-50-1790499655106.json` |
| D / Vercel | 09:02:32.917–09:02:39.630 | `latency-ai-50-1790499759630.json` |

Both Vercel runs used the comparison deployment above. Both Netlify runs used the isolated instrumented draft `https://6ab8bc51dac313ca33edcc46--falachatapp.netlify.app`. These are not production learner requests. Netlify dashboard reports use the matching basename plus `-observability.json`. These local files are optional supporting evidence; the maintained tables retain the results for another workstation or agent.

### Client result, milliseconds

| Run / host | Wave | Under 3 s | p50 | p95 | Maximum | p95 gate |
|---|---:|---:|---:|---:|---:|---|
| A / Vercel | 1 | 15/50 | 3,119.4 | 3,457.0 | 4,209.3 | Fail |
| A / Vercel | 2 | 50/50 | 1,793.7 | 2,454.6 | 2,762.2 | Pass |
| B / Netlify | 1 | 0/50 | 4,417.9 | 6,331.9 | 6,402.4 | Fail |
| B / Netlify | 2 | 23/50 | 3,226.6 | 4,118.3 | 5,467.3 | Fail |
| C / Netlify | 1 | 21/50 | 4,069.6 | 6,271.7 | 8,240.4 | Fail |
| C / Netlify | 2 | 27/50 | 2,160.5 | 4,005.0 | 5,581.4 | Fail |
| D / Vercel | 1 | 48/50 | 2,372.2 | 2,630.3 | 3,555.8 | Pass |
| D / Vercel | 2 | 49/50 | 1,892.0 | 2,397.3 | 3,120.8 | Pass |

The collector returned exit 2 for A, B and C because at least one wave missed the three-second p95 gate, and exit 0 for D. Success counts alone are not a latency pass. Across the second waves, 99/100 Vercel requests and 50/100 Netlify requests were below three seconds. Vercel's initial wave still failed, and its later passing waves still include individual requests above three seconds.

### Component measurements, p50 / p95 in milliseconds

| Run / wave | AI | DB | Handler | Outside handler |
|---|---:|---:|---:|---:|
| A / 1 | 1,778.4 / 2,160.4 | 102.4 / 179.4 | 1,916.2 / 2,250.7 | 1,196.6 / 1,499.6 |
| A / 2 | 1,532.5 / 1,776.3 | 40.0 / 101.1 | 1,564.3 / 1,894.1 | 195.5 / 779.8 |
| B / 1 | 1,916.7 / 2,411.2 | 76.9 / 169.0 | 2,058.2 / 2,576.3 | 1,929.3 / 4,554.6 |
| B / 2 | 1,589.9 / 1,770.1 | 6.9 / 26.3 | 1,602.4 / 1,793.8 | 1,709.8 / 2,476.4 |
| C / 1 | 1,691.5 / 1,979.6 | 8.1 / 138.4 | 1,760.1 / 2,098.8 | 2,399.6 / 4,636.3 |
| C / 2 | 1,642.4 / 1,893.6 | 7.3 / 162.7 | 1,657.0 / 1,908.1 | 383.1 / 2,254.7 |
| D / 1 | 1,852.9 / 2,051.4 | 124.9 / 152.5 | 1,969.9 / 2,192.2 | 400.0 / 432.9 |
| D / 2 | 1,657.3 / 2,092.0 | 36.7 / 72.0 | 1,694.7 / 2,123.2 | 191.3 / 370.2 |

Percentiles of different components must not be added. Outside-handler time is the per-request client total minus its handler span; it includes transport, download, initialization and hosting work, not a directly measured queue. For example, the slowest Vercel A request spent 874.8 ms receiving its small response body; its entire residual cannot be attributed to dispatch. Client queue p95 stayed below 24 ms. Second waves reused client sockets and had no measured connection setup.

The initial A wave had 43 first application invocations and seven reused invocations; D wave one had one first and 49 reused. In the second waves, A and D had 47/50 and 49/50 requests on instances observed in their respective first waves. Netlify B had 49/50 such requests and C had 40/50, although C's second wave had 47/50 non-first invocations overall. New client connections are not proof of cold functions, and a non-first invocation is not proof of zero platform resume overhead.

### Netlify's independently reported spans

All timings below were joined to the exact synthetic request IDs, without collecting client IPs or learner text.

| Run / wave | Request p95 | Function p95 | Before-function p50 / p95 / maximum |
|---|---:|---:|---:|
| B / 1 | 6,156.3 | 3,626.6 | 576 / 4,162 / 4,217 |
| B / 2 | 4,053.8 | 1,862.5 | 1,529 / 2,126 / 3,656 |
| C / 1 | 6,084.6 | 2,168.4 | 2,061 / 4,307 / 6,086 |
| C / 2 | 3,948.8 | 2,678.3 | 146 / 2,056 / 3,930 |

The slowest C request, `01M3H1GP3E4CXS9NQB8BTSK3PR`, took 8,240.4 ms at the client, 8,090.2 ms in Netlify's request duration and 1,883.5 ms in its function operation. The application measured 1,818.9 ms total, including 1,809.9 ms AI and 8.1 ms DB. Netlify placed **6,086 ms before function execution** and 120.7 ms afterward. This was invocation **eight** of an instance with a module age of 123,883.3 ms, so first application initialization cannot explain it. These platform timestamps identify placement; they do not reveal the internal scheduler's cause or guarantee synchronized clocks.

### Interpretation and remaining gate

The repeated second-wave p95 improved from **4.01–4.12 s on Netlify to 2.40–2.45 s on Vercel**, while AI p50 was similar (1.53–1.66 s on Vercel versus 1.59–1.64 s on Netlify). Even when Netlify's median improved in run C, its outside-handler tail remained substantially larger. This supports testing Vercel further as a way to reduce the observed hosting-path delay; it does not establish that every delay is caused by Netlify or that the app is already fixed.

The target is not fully met: the first Vercel wave failed, individual Vercel outliers remained, and the fixed short prompt does not exercise real learner transactions, longer histories, help/repair, audio or sustained 50-user traffic. The next experiment must cover that full path and account isolation/idempotency. No paid hosting plan, production migration, app version change or Play release was performed.
