# Fala documentation

This is the entry point for people and coding agents taking over the repository. It does not depend on the Codex conversation or ignored local artifacts.

## Start here

| Need | Document |
|---|---|
| Owner overview and project handoff | [Owner guide](owner-guide.md) |
| Continue development in a fresh checkout | [Agent/developer handoff](agent-handoff.md) |
| Publish the next version, including rollback/retries | [Release runbook](releasing.md) |
| Switch to Claude Code, Copilot or another agent | [Agent setup and skills](agent-setup.md) |
| Service capacity, paid routing and latency | [Recovery and measurement](service-reliability.md) |
| Reproduced multi-second response delay | [26 September latency investigation](latency-investigation-2026-09-26.md) |
| Vercel-only operation and Netlify shutdown | [27 September retirement receipt](netlify-retirement-2026-09-27.md) |
| Historical live test and exact Netlify dashboard timings | [27 September Observability comparison](latency-investigation-2026-09-27.md) |
| Cold-start hypothesis tested with instance reuse | [27 September invocation-reuse experiment](latency-invocation-reuse-2026-09-27.md) |
| Reproduce the isolated Vercel comparison and review migration gates | [Hosting comparison](hosting-comparison.md) |
| Vercel deployment and measured AI comparison with Netlify | [27 September Vercel probe receipt](vercel-probe-2026-09-27.md) |
| Full-session isolation, reproduced pool contention and implemented fix | [27 September session concurrency check](session-concurrency-2026-09-27.md) |
| Current lesson-quality correction | [Meaningful conversations and evaluation](lesson-quality.md) |
| Latest recorded publication evidence | [0.15.0 release and home-review fix](releases/0.15.0.md) |
| Earlier language/reminder release | [0.14.0 release record](releases/0.14.0.md) |
| Architectural detail | [Architecture](architecture.md) |

## Product and operations

| Area | Maintained reference |
|---|---|
| Hosting, database, environment and provider routing | [Deployment](deployment.md) |
| Google login and signing certificates | [Google sign-in](google-sign-in.md) |
| Google Play setup, service account, signed bundles and store assets | [Google Play](google-play.md) |
| Native in-app update offers | [App updates](app-updates.md) |
| Web installation, browser speech and iPhone use | [Web app](web-app.md) |
| Shared Hebrew/English UI and reminder-default migration | [Localization](localization.md) |
| Points, skins and private circles | [Gamification](gamification.md) |
| VAPID keys, notification subscriptions and scheduled delivery | [Reminder operations](reminders.md) |
| Practice levels and independent evidence | [Learning progression](learning-progression.md) |
| Capoeira knowledge and lesson rotation | [ABADÁ curriculum](abada-curriculum.md) |
| Teaching constraints and reviewed examples | [Didactic review](didactic-review.md) |
| First-conversation guide | [Walkthrough](walkthrough.md) |
| Recording/playback diagnostics | [Microphone support](microphone-support.md) |
| User reports and operator handling | [Content reports](content-reports.md) |
| Historical test evidence and physical-device checks | [Validation](validation.md), [device checks](device-checks.md) |
| Child-access rollout prerequisites | [Children and AI rollout](children-ai-rollout.md) |
| Store listing and closed-test planning | [Store package](../store/google-play/README.md), [closed test](../store/google-play/closed-test-plan.md) |

The source code and current workflow definitions determine behavior. Dated release receipts record a point in time; they are not proof of today's review state. Read current remote state before publishing. Keep prior release notes and evidence when adding a new record.
