# Live latency test with Netlify Observability — 27 September 2026

## Result

The owner watched the Netlify Observability dashboard while a new 50-request synthetic burst ran at **09:13:01–09:13:09 Israel time (06:13 UTC)**. All requests succeeded, but none finished within three seconds. Client median was **5.286 seconds**, p95 **7.157 seconds**. We then extracted the dashboard's request details for **all 50 exact request IDs**, including each request's total duration and its `api` function operation.

The slowest request took **7,245.1 ms** at the client. Netlify independently reported **7,089.5 ms** request duration and **1,813.7 ms** function duration: **5,275.8 ms outside the function operation**. Its platform timestamps placed the function start **5,162 ms after request arrival**. Fala's handler took **1,744.2 ms**, including **1,715.7 ms** AI and **23.6 ms** SQL. The long delay is visible inside Netlify's own request measurement, independently of subtracting application time from a client-side timer.

This strengthens the earlier hosting/invocation-path finding. It still does **not** identify an internal queue, a configured account limit, or a proven hosting/plan change that would fix it. Platform-reported timestamps are not a guarantee that underlying service clocks are synchronized; request-minus-function duration independently establishes a large residual.

## Measured comparison

All calls used the fixed operator-only `/diagnostics/ai` route with `primary`, on the existing approved paid OpenAI configuration. No learner data, session writes or production settings were changed. There were **105 AI requests in total** and **105 provider HTTP 200 observations**. These are short bursts, not sustained 50-learner sessions or device/audio tests.

| Burst / UTC start | Successes | Under 3 s | Client p50 / p95 / max (ms) | Handler p50 / p95 (ms) | AI p50 / p95 (ms) |
|---|---:|---:|---:|---:|---:|
| 50 / 06:13:01.625 | 50/50 | 0 | 5,285.8 / 7,156.9 / 7,245.1 | 1,972.7 / 3,454.4 | 1,909.8 / 3,204.0 |
| 25 / 06:18:36.485 | 25/25 | 18 | 2,483.6 / 4,441.5 / 4,497.4 | 1,752.7 / 1,977.0 | 1,619.3 / 1,855.5 |
| 30 / 06:18:51.436 | 30/30 | 18 | 2,154.8 / 4,325.9 / 5,515.4 | 1,513.8 / 1,873.6 | 1,506.8 / 1,866.3 |

Dashboard request-detail coverage was **105/105**, joined by exact ID:

| Burst | Netlify request p50 / p95 (ms) | Function operation p50 / p95 (ms) | Reported before-function p50 / p95 (ms) | Before-function >2 s |
|---|---:|---:|---:|---:|
| 50 | 5,125.9 / 6,993.1 | 2,092.9 / 4,479.0 | 627 / 5,132 | 25/50 |
| 25 | 2,321.6 / 4,275.1 | 1,867.2 / 2,109.5 | 283 / 2,363 | 7/25 |
| 30 | 2,038.4 / 4,204.5 | 1,574.3 / 1,939.4 | 162 / 2,122 | 3/30 |

Exactly 25 of the first 50 requests had over four seconds of reported pre-function delay. This prompted the 25/30 comparison, but that comparison **did not establish a hard limit of 25**: seven requests in the 25 burst still waited over two seconds before the function. The runs were sequential and did not control function initialization or provider variation; a faster later run does not prove greater capacity.

The first burst also had 25 function durations exceeding handler time by over 500 ms (p95 difference 1,114.4 ms), consistent with additional wrapper/initialization work, without an explicit cold-start measurement. AI itself exceeded three seconds on 21 first-burst requests. Thus eliminating the largest pre-function delay alone does not establish the three-second goal for every request.

Do not add percentiles from different columns: they need not refer to the same request. Function, handler, AI and SQL durations overlap.

## Request IDs for the dashboard or support

| Request ID | Client / Netlify request / function (ms) | Reported pre-function (ms) |
|---|---:|---:|
| `01M3GQXP8JK1DX4WHXFX78RFZB` | 7,245.1 / 7,089.5 / 1,813.7 | 5,162 |
| `01M3GQXP92EW51CBFWZ6MT141V` | 7,236.2 / 7,086.2 / 2,092.9 | 4,865 |
| `01M3GQXP9BTAB70RXZS6XSX8RZ` | 7,156.9 / 6,993.1 / 1,748.2 | 5,104 |
| `01M3GR7X956NGFSTZNFQF0WM5D` | 4,497.4 / 4,331.6 / 1,871.3 | 2,342 |
| `01M3GR8BTYC3EEDVJA37EWEQ6F` | 5,515.4 / 5,399.8 / 1,485.1 | 3,799 |

Site ID: `ed619bd9-b888-4276-b235-9733f4d3cd0d`. Production deployment: `6ab79231ad32f40008ab8dbe`. Account metadata was still Personal, function region `us-east-2` before this test. The existing runtime remains 0.14.3.

In Observability choose Production, the test time window, and function `api` or URL `/diagnostics/ai`; select a request to see its details. An unfiltered last-hour view also includes reminder and other requests, so its displayed percentile is not necessarily the fixed test's percentile. Current Personal retention is 24 hours per the [Netlify documentation](https://docs.netlify.com/manage/monitoring/observability/overview/); the maintained evidence here remains usable after dashboard expiry.

## Tool and regression coverage

`scripts/check-observability-latency.mjs` reads the dashboard detail endpoint discovered from Netlify's publicly served UI code:

`GET https://api.netlify.com/api/v1/sites/{siteId}/observability/requests/{requestId}?from_ts={epochMs}&to_ts={epochMs}`

It uses the existing authorized Netlify CLI login, only exact IDs from a bounded synthetic report, five concurrent reads, 15-second deadlines and no redirects. It retains numeric timing fields and request IDs, excluding the dashboard's client address/location, URL, headers, operation metadata and logs. Missing/ambiguous durations remain unknown and incomplete matching exits nonzero. This is an **undocumented dashboard endpoint**, so future API changes may require maintenance; do not silently treat missing data as zero.

Use it after an already completed probe; it does not generate further AI calls:

```bash
node scripts/check-observability-latency.mjs artifacts/latency-ai-50-TIMESTAMP.json
```

The three new regression tests cover duration units and span separation, missing/ambiguous/timestamp-unit handling, and exclusion of private dashboard fields. Validation: **184 tests across 15 files passed**, `npm run build` passed, and whitespace checks passed. No app/runtime changes or new app version were made.

## Next decision

Ask Netlify to trace the pre-function interval for the exact IDs above and identify the concrete dispatch/scaling/concurrency setting or service change that removes it. The dashboard establishes where the delay is reported but does not expose its internal reason. No support message has been sent by the agent.

An AWS VM is not a prerequisite or a demonstrated fix. If current hosting cannot meet the target, compare a managed alternative such as Vercel Fluid Compute using equivalent requests and full learner-session checks before migration. Adapting any shared long-lived process requires reviewing the existing single-connection SQL pool and transaction held across AI generation; moving unchanged code could serialize learners. See the [prior investigation](latency-investigation-2026-09-26.md) for the separate web extra-read finding and full-session limits.
