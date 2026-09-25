# Working on Fala

Fala has a native Kotlin/Compose Android client, a JavaScript web app, and a TypeScript API on Netlify backed by private PostgreSQL tables. The repository is the project memory; a previous chat or an ignored `artifacts/` file is not a prerequisite for continuing work.

- Start with [the handoff](docs/agent-handoff.md) for the code map, invariants, checks and open issues. [The documentation index](docs/README.md) routes to feature details.
- For a release, use [the release skill](.claude/skills/fala-release/SKILL.md) and [the release runbook](docs/releasing.md). Publishing authorization comes from the user's request, not from merely loading a skill. Carry out already-authorized targets without repeatedly asking for the same approval.
- For a reported problem, use [the debugging skill](.claude/skills/fala-debug/SKILL.md). Distinguish a code finding, a reproduced failure, and a measurement from production.
- Keep user-facing explanations in the user's language; this owner normally uses Hebrew. Keep Portuguese teaching content in Brazilian Portuguese.
- Keep secrets out of source, logs, screenshots and documentation. Use established account connections and GitHub Actions secrets. A fresh machine needs its own authorized login; do not search unrelated projects for credentials.
- Before changing shared code, inspect the working tree. Preserve unrelated work. Prefer `codex/` for Codex branches; other agents can follow the repository's current branch convention.

## Product and validation invariants

- Recognition, editing and sending are separate steps. Selecting an answer idea must not submit it. Playback must not activate the microphone.
- Portuguese difficulty is independent of capoeira knowledge, XP and character skins. Reviews contain at most five vocabulary items. Help and demo turns are not independent proficiency evidence.
- Keep learner reads, mutation locks, request IDs and reward ownership scoped to the authenticated account. Preserve retry idempotency and existing opt-outs.
- Edit `locales/he.json`, then run `node scripts/localization.mjs`; commit both generated catalogs. Portuguese and saved conversation translations must not be translated as interface labels.
- Use Node from `.nvmrc`, npm 10.9.7, and Java 21 for CI parity. Backend checks: `npm test` and `npm run build`. Web changes: `npm run test:web`. Native changes: Android unit tests, build and lint; compile changed instrumentation tests. See the handoff for exact commands and device-test limits.
- Documentation-only changes do not require an app version bump or a fresh Play upload. Use the documented documentation-only publication path after checking the diff contains no runtime changes.

## Fala release requirements

The user requires a visible version and release notes for every new app version.

- For each user-visible release, increment the version in `package.json`, the root and root-package entries of `package-lock.json`, Android's `versionName`, the web header and the service-worker cache name. Increase Android's fallback version code as well; CI allocates its own monotonically increasing code.
- Add `releases/<version>.txt` with concise user-facing English notes (at most 500 characters). Keep previous notes. `npm run build` validates version consistency and the notes; the Play uploader attaches them to the release.
- Use the existing signing key and the existing `com.fala.app` identity. Never print or commit signing credentials, service-account keys or GitHub tokens.
- Automated publishing targets Google Play internal testing. Confirm the upload result before reporting that an Android update is published. Netlify deployment alone does not update an installed Android binary.
- For server-only content updates, explain that existing clients receive the content without a phone reinstall. Keep Portuguese difficulty separate from capoeira knowledge, and end-of-session vocabulary reviews capped at five items.

- Use npm 10.9.7 (the Node 22 CI toolchain) when updating the lockfile. npm 12 can remove optional Netlify peer dependencies required by npm 10. Verify changes with `npx --yes npm@10.9.7 ci` before pushing.
