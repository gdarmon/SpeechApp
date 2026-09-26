# Production conversation latency investigation — 26 September 2026

## Finding

The reproduced multi-second tail is predominantly **before the Fala handler executes, in the hosting/invocation path**. It is not explained by model generation, SQL, downloading the JSON response, or opening the client's connection. Exact Netlify request-ID correlation supplies stronger evidence than simply subtracting `Server-Timing` from the round trip.

A representative request took **7,172 ms** end to end. Its Netlify report places invocation approximately **5,236 ms after the client started the request** and reports **1,841 ms execution**. Fala's handler measured **1,835 ms**, including **1,827 ms AI** and **7 ms SQL**. The platform and handler execution durations differ by only **6 ms**. This slow request therefore does not have an expensive initialization period inside the reported execution interval. The measured client connection phases total about 159 ms and response-body download is 0.2 ms.

The strongest supported diagnosis is delayed dispatch/invocation on the hosting path, with additional startup overhead in some first-wave requests. The evidence does **not** identify Netlify's internal queue, a numeric account concurrency ceiling, a particular retry policy, or a paid-plan remedy. An exact internal explanation needs the provider's request trace. Do not label the entire unexplained duration “cold start,” and do not promise that buying Pro or raising OpenAI limits fixes it.

No production runtime, provider, billing, database, or mobile binary was changed in this investigation. Tests and operational diagnostic scripts were added. The latency problem remains unresolved; this is a measured diagnosis, not a speed-fix release.

## Method and scope

Production: `https://falachatapp.netlify.app`, runtime release **0.14.3**, recorded source `9be7cb2f3b6a8a740cf1a985f11376b3f91fb3ab`. Netlify account metadata still reports `Personal` and function region `us-east-2`. Earlier authorized diagnostics also place the database in `us-east-2`.

The operator-only fixed synthetic `/diagnostics/ai` endpoint was exercised with `route: primary`, using the already approved paid OpenAI route. This avoids learner history, session/reward writes, Groq hedging, microphone recognition, and playback. The normal synthetic-probe usage/flood guard still applies. There were **203 successful AI requests**: 3 serial, 30 in ten-request waves, 150 in fifty-request waves, and 20 over HTTP/2. The 183 HTTP/1.1 samples recorded no provider HTTP errors. This is a bounded diagnostic workload, not sustained 50-learner capacity or a full-session teaching evaluation.

The maintained harness records each request's:

- Client socket queue, DNS, TCP and TLS setup (HTTP/1.1), response-header wait and body download.
- Total monotonic round trip and the server's handler, AI and SQL spans.
- `x-nf-request-id`, status and sanitized numeric provider observations; no tokens or conversation text.
- Separate waves with connection reuse and a real latency gate, not just an HTTP success count.

The HTTP/2 countercheck uses ten concurrent streams on an established connection; Netlify advertised 100 allowed concurrent streams. Connection establishment is excluded from those wave measurements and recorded separately by the maintained harness. The countercheck also reproduced the delay, ruling out dependence on the original HTTP/1.1 client alone. It does not establish the latency on the owner's actual phone or mobile network.

## Measurements

Times are milliseconds; p95 uses the nearest-rank sample percentile. Each row is a separate wave, not a claim that the platform guaranteed warm instances.

| UTC window / transport | Requests | Under 3 s | Total p50 | Total p95 | AI p50 | Outside-handler p50 |
|---|---:|---:|---:|---:|---:|---:|
| 12:06:49, HTTP/1.1 serial first request | 1 | 0 | 3,315 | 3,315 | 2,671 | 499 |
| Immediately following serial request 2 | 1 | 1 | 2,027 | 2,027 | 1,789 | 218 |
| Immediately following serial request 3 | 1 | 1 | 1,920 | 1,920 | 1,701 | 209 |
| 12:07:23, ten-request first wave | 10 | 1 | 3,492 | 5,161 | 1,707 | 1,525 |
| Ten-request second wave | 10 | 9 | 2,159 | 4,165 | 1,698 | 221 |
| Ten-request third wave | 10 | 8 | 1,845 | 3,551 | 1,576 | 217 |
| 12:07:55, fifty-request wave | 50 | 9 | 3,900 | 6,061 | 1,611 | 2,319 |
| 12:10:19, fifty-request first wave | 50 | 18 | 4,079 | 6,702 | 1,654 | 2,454 |
| Immediately following fifty-request wave | 50 | 25 | 2,698 | 4,505 | 1,616 | 328 |
| 12:13:52, HTTP/2 ten-request first wave | 10 | 1 | 4,528 | 4,853 | 1,753 | 2,835 |
| HTTP/2 ten-request second wave | 10 | 1 | 3,506 | 4,998 | 1,546 | 1,942 |

The HTTP/1.1 fifty-request wave at 12:07:55 measured DNS p95 **2.3 ms**, TCP p95 **65.2 ms**, TLS p95 **84.6 ms**, client socket queue p95 **24.5 ms**, and body download p95 **3 ms**. Handler p95 was **2,003 ms** and SQL p95 **167 ms**. These components do not explain the six-second p95 total.

The following fifty-request wave at 12:10 had **no new DNS/TCP/TLS setup**. Even then p95 total remained **4,505 ms**, versus **2,175 ms** handler time and **29 ms** SQL time. Keeping connections open or warming a health endpoint is therefore insufficient as a complete fix.

Public health controls (no SQL or AI) measured **1,633 ms** on the first HTTP/1.1 request and **222/226 ms** on the next two. A later established-HTTP/2 health check measured **351/277/269 ms**. The long AI-request delays are not the baseline cost of transferring every response from this workstation.

## Matched hosting evidence

All **50/50** request IDs from the 12:07:55 burst were matched to Netlify's historical `api` function reports. Examples, useful for provider investigation:

| Netlify request ID | Total | Handler | Platform execution | Platform timestamp offset from client start |
|---|---:|---:|---:|---:|
| `01M3ESTT70MSWHZK7A2XHRBSZ6` | 7,172 | 1,835 | 1,841 | 5,236 |
| `01M3ESTT5ZRPT7RB0GKDNENR1J` | 7,091 | 1,653 | 1,659 | 5,337 |
| `01M3ESTT679FFHTKYJNS3ZJWCG` | 6,061 | 1,769 | 1,774 | 4,194 |

In **28/50** requests, the reported platform timestamp was over two seconds after client start while the platform execution exceeded Fala's handler duration by less than 100 ms. This supports delayed invocation of already initialized execution, rather than attributing all long tails to cold initialization.

Some other reports exceed handler duration by roughly **0.8–0.9 seconds**, consistent with additional wrapper/initialization work. There is no explicit `Init Duration` field in the retrieved reports, so that difference is not a direct cold-start measurement. Platform duration may include time that overlaps other timestamps; do not add all reported spans together. Platform timestamps and the client wall clock are different clocks; offsets are approximate supporting evidence. Client total and server spans independently establish the large residual.

Historical function logs arrive asynchronously. A missing match is unknown, not a fast or failed invocation. The correlator reports its match count and exits nonzero when incomplete. Later-wave evidence should retain that coverage count rather than silently treating partial logs as complete.

## Other findings and boundaries

- The observed OpenAI limit remained **500 RPM / 500,000 TPM** during this check. More capacity is still needed for the earlier sustained-use assumption, but these primary-route test requests were not rejected by provider quotas. Capacity upgrades and the measured hosting delay are separate work.
- Native `SessionController.sendDraft()` makes one turn request and uses its returned reply. Its current transport has no automatic retry or quota sleep after Send. End-of-session summary generation is additional work after the tenth answer.
- Web Send currently discards the reply from `POST /sessions/:id/turns` and waits for another `GET /sessions/:id` before rendering and playing it. This is an additional avoidable round trip found in code, not the cause of the reproduced native/API hosting delay. A web fix must preserve request identity, help counting and the server-owned saved reply, with browser retry tests.
- A real learner turn also reads account context, holds an account-scoped mutation transaction and persists its result. The synthetic endpoint does not cover those costs, translation quality over full conversations, transcription, UI rendering, or playback. No learner data was used to fill those gaps.

## Next corrective work

1. Use the exact request IDs and UTC window above in Netlify Observability or a provider support investigation. Ask which dispatch/scaling/concurrency stage delayed warm invocations by 4–5 seconds, and what concrete setting or service commitment removes that delay. The evidence is prepared here; no support message was sent.
2. Benchmark an API hosting configuration with sufficient immediately available request capacity. If Netlify cannot provide that behavior, evaluate an always-running API colocated with PostgreSQL. Keep the existing account isolation, idempotency, validated first-winner provider routing and one request deadline. Moving only the API away from its database is not a justified optimization.
3. Remove the web's redundant post-send session read with a regression that delays/fails that read while preserving the delivered reply. Measure actual native Send-to-render and speech startup on a test phone.
4. Re-run both first-wave and reused-connection fifty-request gates, then a gradual sustained test with dedicated test-only learner accounts and provider capacity sufficient for the load. Accept the speed goal only when **p95 end-to-end is below three seconds**, failures are included, and reply quality and account isolation still pass.

## Reproduce

See [service reliability](service-reliability.md#detailed-latency-investigation) for commands and opt-ins. Local raw artifacts are optional; this document preserves the useful measurements and exact platform request IDs independently of the original workstation.

The added local regression suite covers connection-pool queue attribution, delayed response bodies, deadlines, no redirect/credential forwarding, failures in percentile gates, exact-ID log matching, missing observations, and concurrent HTTP/2 streams. It runs as part of `npm test`. Live checks remain opt-in and billable, separate from CI.

Validation completed on Node 22.22.2: npm 10.9.7 clean installation, **181 tests across 14 files** (including eight new latency regressions), TypeScript/site build, and diff whitespace checks. Initial sandbox runs blocked loopback listening and esbuild subprocess execution; the same checks passed with the environment's normal execution permission. No native/web runtime files changed, so no new mobile build or browser acceptance release is claimed.
