---
name: fala-debug
description: Diagnose Fala practice, reply ideas, speech speed, latency, Hebrew/English UI, reminders and update problems. Use when investigating a reported Fala behavior and selecting focused checks or a fix.
---

# Debug Fala

Read `AGENTS.md`, [the source map and open issues](../../../docs/agent-handoff.md), and the relevant feature document from [the index](../../../docs/README.md).

Establish the affected client and visible version, the triggering action, and whether the issue concerns a new or resumed conversation. Infer what is available from the report/screenshot before asking for missing detail. Inspect relevant code and reproduce locally where possible.

Use these routes:

- Repeated answer ideas: `src/pedagogy.ts`, `src/coaching.ts`, `src/prompts.ts`, and the saved lesson/question intent. A repeated pair on changed questions is distinct from intentional repair/help repetition.
- Slow playback: native `SessionController.kt` → `voice/AndroidSpeechOutput.kt`; web `app.js` → `voice.js` and `src/speech.ts`. Normal and explicit slow playback are separate. Verify engine/device behavior before calling naturalness fixed.
- Waiting after Send: recognition may already have finished. Trace the request, DB work, AI generation, validation repair/retries and playback separately. Use `Server-Timing`/authorized logs for measurements; do not infer a five-second timer from an animated progress bar. Preserve request IDs on retries.
- Wrong language: selected account UI language versus the saved conversation's support language; shared catalog generation, RTL UI and LTR Portuguese. Never translate a learner's answer through the UI catalog.
- Missing reminders: account default/opt-out, time zone, OS permission, browser subscription or native scheduling, same-day practice and per-account delivery deduplication. Default enabled does not bypass OS permission or guarantee exact-time delivery.
- Missing update: distinguish website deployment, signed Android upload, track eligibility, review lifecycle and installation. A successful website deployment cannot update a native binary.

Use focused tests that reproduce meaningful behavior. Run relevant existing suites after a fix. Keep diagnosis read-only until a change is justified; the skill alone authorizes no production data changes, provider switch, credential access outside the task, or publication. Continue actions already authorized by the user. Report what was observed, what changed, what passed, and anything still unmeasured.
