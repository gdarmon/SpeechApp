# Vercel-only hosting — 27 September 2026

The owner explicitly required ending all Fala hosting on Netlify after receiving a Netlify notification for 0.15.0. The notification was caused by the still-linked GitHub repository: the compatibility site continued building on main pushes even though the application API and new Android builds already used Vercel. Keeping that deployment did not meet the owner's intended complete migration.

## Verified remote shutdown

At **13:43:29 UTC**, using the existing authorized account connection, Fala site `falachatapp` (`ed619bd9-b888-4276-b235-9733f4d3cd0d`, account `gdarmon`) was:

1. Stopped from automatic builds.
2. Unlinked from `gdarmon/SpeechApp`.
3. Disabled using Netlify's reversible disable operation.

The subsequent account read reported `disabled: true` and no repository link. There were no remaining GitHub repository webhooks. Public checks returned **404** for the old `/health`, `/app/` and `/app/sw.js`, with no redirect or proxy response. This is a disabled project retaining its history/configuration, not a deleted account or a billing-plan cancellation. Do not reactivate it, recreate its forwarding, or require its credentials for normal work. [Netlify disable semantics](https://docs.netlify.com/manage/projects/disable-project/).

Before and after shutdown, `https://fala-api.vercel.app` returned health 200 with `X-Fala-Host: vercel`, app 200 with **Web 0.15.0**, and service-worker 200. Privacy and account-deletion pages were also reachable before shutdown. The primary database, AI credentials, VAPID pair, reminder scheduler and Google/Android identities were not moved or rotated by this operation.

## Repository maintenance

Removed the Netlify deployment configuration, function adapters and CLI/function dependencies. The npm 10.9.7 clean install now contains 71 packages rather than the former roughly 1,120; its audit reported zero vulnerabilities. CI verifies the isolated Vercel package instead of packaging Netlify functions. Local development uses `.fala/dev-build`. Browser tests take the security policy from Vercel configuration.

All active latency harness defaults, store source URLs and the privacy host name use Vercel. Synthetic fixture setup accepts an explicitly supplied `FALA_MIGRATION_DATABASE_URL` rather than fetching a connection from Netlify. The old Netlify-only network collectors remain in Git history at `bb13723`; historical comparisons and offline parsers remain available without a Netlify dependency. The historical service-worker test is an offline fixture, not a migration service still hosted at the old origin.

Vercel now uses its canonical origin for cookie checks with no old-site exception. Hosted configuration rejects local unencrypted service connections on Vercel as well as the legacy platform guard. The PostgreSQL connection label is platform-neutral. Android's old-origin migration allowlist remains because it recognizes locally saved settings and points the upgraded app directly at Vercel; it does not contact Netlify.

This is hosting maintenance for the existing **0.15.0** release, with no new client feature or API contract. The already verified Play build **104601** remains the Android release; another binary is not required for this shutdown. Older binaries that still target Netlify must update, and old browser bookmarks/PWA installations must open the Vercel site directly. An old offline cache is not evidence that the retired server is running.

## Verification and publication

Local backend tests, build/version validation, four browser suites and the npm 10.9.7 clean install passed. Full cloud checks and the final Vercel deployment are recorded below after completion. This maintenance does not rerun real AI load tests or claim a new latency result. Actual phone sign-in/installation and notification delivery were not retested.

Store contact/description links are handled separately from Play bundles. The targeted link updater preserves text except the old host, keeps screenshots/tracks unchanged, verifies a fresh edit, and refuses to replace an existing review. Privacy-policy and account/data-deletion fields require separate Console verification.
