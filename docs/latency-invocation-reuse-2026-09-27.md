# Testing the cold-start hypothesis — 27 September 2026

## Finding

The support chatbot suggested cold starts as the likely cause. A new experiment distinguishes first application invocations from invocations of the same already used module instance. **All 50 requests in the second wave used instance IDs observed in the first wave**, yet client p50 remained **3,491.4 ms**, p95 **4,231.7 ms**, and maximum **5,936.9 ms**. Only 23/50 finished below three seconds.

The slowest reused-instance request had **4,122 ms of reported pre-function delay** in Netlify Observability. First-time initialization of Fala's application module is therefore not a sufficient explanation for the entire tail. This does not identify the platform's queue/scaling policy or exclude instance freeze/resume, routing, or another infrastructure stage. `first_invocation` is deliberately not labeled `cold_start`.

## Deployment and method

Source: `b7b99d8` on `codex/diagnose-conversation-latency`. Isolated draft: `6ab8bc51dac313ca33edcc46`, at `https://6ab8bc51dac313ca33edcc46--falachatapp.netlify.app` on the existing Fala site in Ohio.

The draft explicitly selected the already approved OpenAI GPT-5.6 Luna primary, an eight-second AI timeout and zero app daily quotas. Diagnostics verified provider/model, database readiness and region before testing. The primary-only probe bypassed hedging. An initial draft, `6ab8bbe3c0ec03c7f79fde35`, inherited older Groq settings and was not used for AI load tests; matching configuration was required before proceeding. Local build context alone is not proof of deployed provider settings.

Production remained on deployment `6ab79231ad32f40008ab8dbe`, version 0.14.3. No learner sessions or phone binaries changed. The instrumentation adds operator-only response metadata; it is not a user-visible release or a speed fix.

One verification AI request succeeded (3,567.6 ms, already used instance), followed by **100 successful synthetic AI requests** in two consecutive fifty-request waves, from **06:50:01.214 to 06:50:13.138 UTC** (09:50 Israel time). Every provider observation was HTTP 200. This does not establish sustained 50-learner capacity or phone/audio performance.

| Metric | First wave, 50 requests | Second wave, 50 requests |
|---|---:|---:|
| Application instances observed | 27 | 25 |
| First application invocations | 26 | 0 |
| Reused application invocations | 24 | 50 |
| Requests below 3 seconds | 1 | 23 |
| Client p50 / p95 / max (ms) | 3,963.6 / 5,702.5 / 5,951.4 | 3,491.4 / 4,231.7 / 5,936.9 |
| Handler p50 / p95 (ms) | 1,882.5 / 2,352.4 | 1,612.6 / 1,852.3 |
| AI p50 / p95 (ms) | 1,751.4 / 2,182.2 | 1,589.8 / 1,819.0 |
| Netlify request p50 / p95 (ms) | 3,837.8 / 5,570.2 | 3,434.1 / 4,175.2 |
| Netlify function p50 / p95 (ms) | 2,896.6 / 3,373.6 | 1,677.5 / 1,922.2 |
| Reported pre-function p50 / p95 / max (ms) | 349 / 3,660 / 3,981 | 1,683 / 2,264 / 4,122 |
| Reported pre-function interval >1 second | 25 | 27 |

The second wave reused all client connections, with no new DNS/TCP/TLS setup. All its 25 application IDs appeared in the first wave. Within the second wave, 23 instances handled two requests each, one handled one and one handled three. This does not prove an account-wide limit of 25.

## Exact reused-instance evidence

All **100/100** request IDs matched the dashboard detail API.

| Request ID | Instance invocation | Client / Netlify request / function (ms) | AI (ms) | Reported pre-function (ms) |
|---|---:|---:|---:|---:|
| `01M3GT1KFSQZWH5B0X32WS17Y8` | 3 | 5,936.9 / 5,878.1 / 1,708.8 | 1,635.9 | 4,122 |
| `01M3GT1KFPBC8XZ166PRW6F6TE` | 5 | 5,743.6 / 5,686.0 / 1,752.2 | 1,685.8 | 3,883 |

For the first row, the handler took 1,642.2 ms and SQL 5.4 ms. Its module had been loaded for 8,644.1 ms at entry. The dashboard duration gap is independent of the client clock; timestamp-derived placement remains Netlify-reported evidence, not a guarantee of synchronized internal clocks. Do not add overlapping spans or unrelated percentiles.

Ask support for the dispatch/scaling trace of an invocation that demonstrably reused an existing application instance. A generic cold-start explanation is insufficient. The account-specific cause and remedy still require confirmation or an equivalent hosting comparison.

## Instrumentation and access

`src/runtime.ts` assigns a random process-local module-instance ID and captures an immutable invocation number, first-invocation flag and module age at function entry. It contains no account identity or conversation text. Snapshots are passed per request rather than read from mutable state after awaiting provider work.

Only authenticated operator responses from `/diagnostics` and `/diagnostics/ai` expose the snapshot. Health, normal learner endpoints and failed authorization do not expose it. `scripts/check-latency.mjs` whitelists the four fields, rejects malformed observations, and summarizes observed instances and first/reused invocations per wave. Missing observations from older deployments remain unknown.

Reproduce against an explicitly chosen instrumented draft (production does not yet have this metadata):

```bash
FALA_URL=https://DRAFT_ID--falachatapp.netlify.app \
  FALA_RUN_AI_PROBE=true FALA_PROBE_ROUTE=primary FALA_LATENCY_TARGET=ai \
  FALA_LATENCY_CONCURRENCY=50 FALA_LATENCY_WAVES=2 \
  node --env-file=.env scripts/check-latency.mjs

node scripts/check-observability-latency.mjs artifacts/latency-ai-50-TIMESTAMP.json
```

Use existing authorized operator access. Verify provider/model/region/limits before a load run on any new draft. The CLI draft deployment does not change production; never substitute `--prod` for this experiment. Preserve the 100-request harness bound and 120-request/minute operator flood guard.

## Local startup comparison

The packaged API imports `web-push` because `src/reminders.ts` combines subscription persistence with notification delivery. The API does not use delivery, but the eager CommonJS import remains in its generated module. The existing function ZIP was approximately 1.16 MB compressed and 3.70 MB expanded, including platform bootstrap/telemetry.

We compared the packaged application entry with an identical temporary copy having only the unused eager `web-push` import removed. Eight fresh Node 22.22.2 processes per variant ran in alternating order, without credentials; an outbound `fetch` would fail the test. Each imported the API and successfully exercised health twice.

- Baseline import median: **106.13 ms**; maximum 108.38 ms.
- Without eager push import: **91.80 ms**; maximum 93.74 ms.
- Median difference: **14.33 ms**.

This local application-module result has potentially cached filesystem reads. It excludes Netlify bootstrap/telemetry, provisioning, production CPU/network, SQL and AI, and cannot predict a production cold-start duration. It identifies a small cleanup candidate, not evidence that removing the dependency fixes five-second delays. Production source was not changed to remove it.

Validation: npm **10.9.7** clean installation, **187 tests across 16 files**, TypeScript/site build and draft Netlify packaging/deployment passed. New tests cover stable snapshots, distinct instances, operator-only exposure and safe parsing. No browser/native behavior changed.
