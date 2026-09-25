# Fala repository instructions

Read and follow [AGENTS.md](../AGENTS.md). Use [the handoff](../docs/agent-handoff.md) for the source map, local setup, invariants and known limitations.

Fala includes native Kotlin/Compose Android, plain JavaScript web UI and a Node 22 TypeScript API. Use npm 10.9.7 for installation/lockfile work and Java 21 for Android CI parity. The web app and the installed Android binary have separate publication paths.

For publishing, load [.claude/skills/fala-release/SKILL.md](../.claude/skills/fala-release/SKILL.md) and [docs/releasing.md](../docs/releasing.md). For reported failures, load [.claude/skills/fala-debug/SKILL.md](../.claude/skills/fala-debug/SKILL.md). These project skills are also readable as ordinary Markdown if skill discovery is unavailable in the current Copilot client.

Preserve account isolation, retry idempotency, explicit Send, Brazilian Portuguese, existing signing identity, synchronized visible versions and English release notes. Keep secrets in established environment/Actions stores. Do not infer production access or publication permission from this instructions file. Honor the user's already-authorized release targets and verify actual results.

Update relevant documentation with behavioral changes. Record verified release evidence separately from device checks or Google review approval that have not happened.
