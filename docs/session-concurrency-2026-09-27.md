# Full-session concurrency prerequisite — 27 September 2026

## Result and scope

The first full-session concurrency check reproduced serialization when 50 learners share one process and its production PostgreSQL connection pool. All 50 conversations completed with ten saved turns each; account isolation, retry idempotency and the five-word review bound passed. However, only **one AI operation ran at a time**, despite sending 50 learner requests concurrently.

This is a **local controlled experiment**, not a Vercel production measurement. It uses PostgreSQL 17 and the real API, device-token authorization, store, SQL driver, transaction handling, context construction and reward persistence. The AI is an injected test provider with a fixed 25 ms delay; no real provider, hosting, network transport, microphone, transcription or playback is measured. This test does not supersede the [live hosting comparison](vercel-probe-2026-09-27.md).

The result makes a direct migration with the current shared pool unsafe to assume fast. It does not show that Vercel assigned all 50 previous probes to one process; those runs observed many instances. It covers a concurrency pattern that a process serving multiple requests must handle correctly and efficiently.

## Reproduction and safeguards

`tests/session-concurrency.test.ts` is opt-in. It refuses any hostname other than loopback, any database other than `fala_concurrency_test`, and any database user other than `fala_test`. It also checks the server's actual database name and refuses to overwrite an existing `fala` schema. It applies checked-in migrations only to that empty disposable database, seeds 50 synthetic users/device credentials, and removes the schema it created afterward. It never loads `.env` or reads a deployed credential.

Use PostgreSQL 17 in a disposable local container. In the example below, first create the empty `fala_concurrency_test` database with the `fala_test` test role. Replace the port with the local container's mapped port; these credentials are fixtures, not production credentials:

```bash
FALA_CONCURRENCY_DATABASE_URL=postgres://fala_test:fala_test@127.0.0.1:5432/fala_concurrency_test \
npx --yes npm@10.9.7 test -- tests/session-concurrency.test.ts
```

Without that variable, the ordinary suite explicitly skips this one test. CI creates the separate database in its existing disposable PostgreSQL service, runs this test after the native-driver API suite, and retains the sanitized JSON as the `fala-session-concurrency` artifact. No user-visible version or deployment change is needed for this test-only work.

The test performs 900 API calls:

- 50 starts with an identical request ID across distinct accounts, verifying 50 independent session IDs.
- 100 denied foreign-account reads/writes, all HTTP 404.
- 500 turns and 50 retries of the first turn, verifying retries return the saved result.
- 50 saved-session reads, 50 finishes, 50 finish retries and 50 history reads.

All 800 authorized calls returned HTTP 200. Exactly 500 turns and 50 sessions were stored. There were exactly 600 provider invocations: start, ten turns and finish per account. Retry and foreign-account attempts did not invoke the provider. The provider checks the constructed contexts for cross-account synthetic markers. Reports retain only counts, status codes and timing aggregates, not device credentials, user IDs or dialogue.

## Measured local baseline

Run: **09:36:53.618–09:37:12.000 UTC**, 27 September 2026. PostgreSQL 17 ran in a temporary localhost-only container. The test's API calls are in-process and share the unmodified `connectDatabase(settings)` pool.

| Metric | p50 | p95 | Maximum |
|---|---:|---:|---:|
| Observed fake AI duration, 600 operations | 25.1 ms | 25.2 ms | 26.2 ms |
| Wait until transaction callback starts, 750 transactions | 542.6 ms | 1,357.1 ms | 1,463.9 ms |
| Session start, 50 requests | 747.7 ms | 1,383.9 ms | 1,439.3 ms |
| First answer, 50 requests | 786.5 ms | 1,463.3 ms | 1,521.4 ms |
| Tenth answer, 50 requests | 772.8 ms | 1,454.6 ms | 1,514.0 ms |
| Finish, 50 requests | 767.5 ms | 1,401.8 ms | 1,457.1 ms |

Maximum simultaneous provider operations: **1**. Acquisition time starts immediately before the production driver's `transaction()` call and ends when its callback begins. It includes connection availability/transaction startup; it is not an instrumented internal driver queue. Timing aggregates are informational rather than assertions that freeze the slow behavior into the test. Functional isolation, persistence and idempotency are assertions.

Optional local report: `artifacts/session-concurrency-1790501832002.json`. The maintained table above is sufficient to continue without that ignored file.

## Cause and concrete next implementation

`src/database.ts` configures `max: 1`. `Store.mutate()` starts a PostgreSQL transaction, takes an account-scoped advisory lock, then awaits its callback. `Sessions.start()`, `turn()` and `finish()` call the AI inside that callback. The one connection remains occupied while waiting for generation. Other learners in the same process therefore wait even though their account locks are independent. The short synthetic hosting probe does not exercise this pattern.

The preferred implementation to evaluate is to release the SQL connection during AI generation while retaining a durable per-account in-flight claim:

1. In a short transaction, validate ownership and request-ID replay, acquire a bounded account claim, and read the generation context.
2. Commit that transaction, then generate outside it so another account can use the connection.
3. In a new short transaction, verify claim ownership and the expected session state, persist exactly once, award rewards through the existing path, and release the claim.
4. Handle expired claims, failed generation, concurrent retries, a late response after takeover, cancellation and account deletion. Other account mutations must respect the claim; process-local mutexes are insufficient across instances. A late result must not overwrite newer state or award duplicate rewards.

This requires an explicit schema/code change and regression tests; it is **not implemented or deployed in this change**. Do not simply remove the existing account locks. Increasing pool size can reduce this local queue but keeps long-running transactions and multiplies database connections across instances; it needs separate connection-budget evidence and is not an established fix for the target load.

After that implementation passes the local same-process test and race/failure cases, use an isolated hosted test database and dedicated synthetic learners for real generation, staggered 50-learner traffic, longer histories and audio. Measure the full Send-to-reply path and failures before changing learner URLs. Physical Android recognition/playback remains a separate device check. No production data or deployment was changed for this local test.
