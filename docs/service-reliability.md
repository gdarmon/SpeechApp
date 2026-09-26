# Conversation capacity, latency and recovery

The 26 September 2026 report showed Android 0.14.1 stopping around turn four/six with a 26-second retry and a 32-second provider quota error. The deployed route was confirmed as Groq GPT-OSS 120B. These messages identify provider throttling, not a separate translation service: text, translation and reply ideas come from one generation. Previous code could sleep up to 18.25 seconds inside generation and then wait up to 30 seconds again on the client.

The owner authorized paid service and asked for **50 simultaneous learners**. This is a capacity target, not a promise of no outages or of every response arriving within three seconds. Measured results and actual provider limits belong in the dated release receipt.

The first real 50-request burst succeeded technically but exposed a teaching error: the model offered a cord color after the learner said they had no cord. The release now carries that explicit learner fact forward in generation instructions and rejects that rank-choice response before it reaches playback. A later personal statement that the learner now has a cord replaces the earlier fact. A successful HTTP response alone is not a passing teaching-quality evaluation.

## Configuration and recovery

Production routing for this release is intended to use the already configured paid OpenAI credential:

```dotenv
FALA_AI_PROVIDER=openai
FALA_OPENAI_MODEL=gpt-5.6-luna
FALA_AI_FALLBACK_PROVIDER=groq
FALA_GROQ_MODEL=openai/gpt-oss-120b
FALA_AI_HEDGE_MS=1200
AI_TIMEOUT_MS=8000
FALA_TRANSCRIPTION_PROVIDER=openai
FALA_DAILY_USER_LIMIT=0
FALA_DAILY_APP_LIMIT=0
```

Use the existing `FALA_OPENAI_API_KEY` and Groq credential, never a key copied from another project. Environment edits require a function redeployment. Verify the runtime through authorized diagnostics rather than assuming a console edit is active. The release receipt records whether this intended configuration was activated and tested.

- A failed primary starts the configured backup immediately. A slow primary starts backup after 1200 ms. Both retain the identical learner context and level-specific validation. The first valid result wins; the other request is cancelled. Only the winning reply reaches the existing account-scoped transaction and idempotent append.
- One generation repair is allowed per route. There are at most four generation attempts, with one shared eight-second default deadline. There is no sleep/retry on the same provider's 429. The deadline is a failure bound, not the target response time.
- A short cooldown skips a recently throttled route in the same warm function instance. It is keyed by a non-reversible digest of provider/model/credential, contains no learner text, and is not a distributed availability guarantee.
- New clients add no quota countdown or automatic replay. A failed request returns control with its draft/request ID preserved for explicit Retry. Older clients benefit from server recovery without reinstalling; removing their client countdown requires the updated binary.
- `0` disables the corresponding daily **app** request allowance. The authenticated per-account 120-request/minute flood guard remains. Provider billing, balance, account quotas and hosting/database capacity are separate and still apply.
- OpenAI GPT-5.6 Luna uses `reasoning_effort=none`, strict JSON and `store:false`. Other previously supported models keep their existing low reasoning setting. Provider retention policies still apply. The privacy page names both text processors and the paid web transcription route. Eligibility/consent rules are unchanged.

## Size the provider account for 50 learners

Estimate `requests/minute = active learners × 60 / average seconds between sends`. At one send every ten seconds, 50 learners need about **300 conversation requests/minute**. Multiply by measured input/output tokens, then allow headroom for starts, summaries, help, repairs and backups. At 4,000 tokens per request this is about **1.2 million tokens/minute** before that headroom. Audio endpoints have separate quotas. A 50-request burst is not a sustained 50-learner voice test.

The [Groq limits reference](https://console.groq.com/docs/rate-limits) lists 8,000 TPM for the free GPT-OSS route and notes organization-wide limits and paid upgrades. A free Groq backup alone cannot sustain this target if the primary is unavailable. Check the account's actual limits rather than assuming a paid label removes all limits. Record numeric rate-limit response headers from real probes; if insufficient, the account owner must increase capacity/billing in that provider's console.

[OpenAI's Luna model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna) documents no-reasoning mode, structured output and standard short-context prices of $0.20/million input tokens and $1.20/million output tokens at this review. For an illustrative 4,000-input/250-output request, that is about **$0.0011**, or **$1.10 per 1,000 requests**, before caching, repairs, duplicate backup work and audio. It is an estimate, not an account bill or spending cap. Cancelled work may still be billed. See [latency guidance](https://developers.openai.com/api/docs/guides/latency-optimization) and the actual provider usage dashboard.

## Reproduce live checks without extracting provider secrets

The established Fala operator token can call the deployed API even when Netlify masks AI credentials. Configure `FALA_URL` and `FALA_TOKEN` through an authorized local environment; never print the token or put it in a URL. A new workstation needs its own authorized access.

`POST /diagnostics/ai` accepts only `{route: "active"|"primary"|"fallback"}`. It uses one fixed synthetic Hebrew-supported capoeira turn, no saved learner context, and returns the generated answer plus numeric provider capacity/token/timing observations. Ordinary learner accounts receive 403. The request is billed and subject to the account flood guard.

```bash
# One probe first; inspect model access, billing, semantics and actual limits.
FALA_RUN_AI_PROBE=true FALA_PROBE_ROUTE=primary \
  node --env-file=.env scripts/check-ai-capacity.mjs

# Authorized, bounded burst. Do not loop this in production.
FALA_RUN_AI_PROBE=true FALA_PROBE_CONCURRENCY=50 \
  node --env-file=.env scripts/check-ai-capacity.mjs

# Optional: two full sessions on a dedicated test-only learner account.
# Requires FALA_TEST_ACCOUNT_TOKEN, not the operator token above.
# Checks retry identity, ten stored turns and a review of at most five items.
FALA_RUN_CONVERSATION_CHECK=true \
  node --env-file=.env scripts/check-live-conversation.mjs
```

The optional full-session script uses ordinary learner APIs, which personalize from the signed-in account's history and update its aggregate progress/rewards. Supply only an authorized, dedicated test-only account token as `FALA_TEST_ACCOUNT_TOKEN`. It deletes the conversation IDs it creates, but aggregate rewards persist by design. Never use a real learner's account or the operator account for this test. If no dedicated account is available, report the full-session live check as unperformed; the fixed operator probe above remains independent of saved learner context.

Read every generated conversation, not just the pass count. Record completed/failed requests, p50/p95/max and the number below three seconds; distinguish AI time, DB time, network/cold-start time and phone speech. Synthetic probes do not measure microphone recognition, device playback, diverse learner behavior or sustained service under load. Partial results are failures to complete, not a passing quality evaluation. Keep transcripts in ignored artifacts; preserve sanitized conclusions in the release receipt.

If billing/model access fails, use the existing provider console and authorized configuration. Do not add free accounts to evade quotas, retry forever, return scripted teaching as if it were AI, or claim that removing the warning solved capacity. No user account, saved answer or history is deleted by recovery.

## Detailed latency investigation

The [26 September investigation](latency-investigation-2026-09-26.md) matched the reproduced long tail to delayed hosting invocation, including requests whose platform execution was only a few milliseconds longer than Fala's handler. Raising AI quotas alone does not address that evidence. The following maintained checks separate network, handler and provider time without changing a learner's history:

```bash
# Public baseline: three sequential requests, then read-only authenticated SQL.
node scripts/check-latency.mjs
FALA_LATENCY_TARGET=diagnostics node --env-file=.env scripts/check-latency.mjs

# Fixed synthetic content only; paid and explicitly enabled. Start small.
FALA_RUN_AI_PROBE=true FALA_LATENCY_TARGET=ai \
  FALA_LATENCY_CONCURRENCY=10 FALA_LATENCY_WAVES=3 \
  node --env-file=.env scripts/check-latency.mjs

# Two bounded fifty-request waves. Do not loop in production.
FALA_RUN_AI_PROBE=true FALA_LATENCY_TARGET=ai \
  FALA_LATENCY_CONCURRENCY=50 FALA_LATENCY_WAVES=2 \
  node --env-file=.env scripts/check-latency.mjs

# Independent HTTP/2 comparison using one established, multiplexed connection.
FALA_RUN_AI_PROBE=true FALA_LATENCY_TARGET=ai FALA_LATENCY_TRANSPORT=http2 \
  FALA_LATENCY_CONCURRENCY=10 FALA_LATENCY_WAVES=2 \
  node --env-file=.env scripts/check-latency.mjs

# Match only the resulting request IDs to hosting logs using the existing
# authorized Netlify CLI login. Substitute the report filename just printed.
node scripts/check-hosting-latency.mjs artifacts/latency-ai-50-TIMESTAMP.json
```

`FALA_PROBE_ROUTE` defaults to `primary` in the detailed harness, isolating the provider from hedging; use `active` to include configured recovery. `FALA_URL` defaults to the production Fala host. The token is sent only to that explicitly configured HTTPS origin, and redirects are never followed. Reports contain timing/request IDs and numeric provider observations, never learner or generated text. HTTP/2 reports connection setup separately and excludes it from request-wave timings. First wave is not proof of a cold function, and later waves do not guarantee warm server instances.

Limits are 1–50 concurrent requests, 1–3 waves and at most 100 requests per invocation. The existing 120-request/minute operator flood guard and provider token capacity still apply across separate invocations; leave appropriate time between large runs. A run exits **1** on HTTP/transport/response validation failures, **2** when any wave misses the p95 target (default `<3000 ms`, configurable through `FALA_LATENCY_MAX_P95_MS`), and **0** only when all waves pass. Small sample percentiles are descriptive, not an SLA.

Hosting logs can take minutes to arrive. Their correlator exits **2** on incomplete coverage; rerun that read-only correlation later without repeating AI calls. It uses the repository's pinned Netlify CLI modules and existing login, and never writes unrelated log messages. `NETLIFY_SITE_ID` defaults to the documented Fala site. Timestamp offsets use separate clocks; platform duration can overlap initialization, so avoid summing overlapping spans or labeling every residual as queue time.
