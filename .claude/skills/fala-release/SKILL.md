---
name: fala-release
description: Prepare, publish and verify Fala releases to its Netlify website/API and Google Play internal or closed testing. Use for version bumps, release readiness, uploads, promotions, or publication status in this repository.
---

# Release Fala

Read `AGENTS.md` and [the release runbook](../../../docs/releasing.md), resolving repository paths from the checkout root. Find the latest dated receipt in [docs/releases](../../../docs/releases/) as historical evidence, then check current remote state.

1. Identify the requested targets and existing authorization. Preparing changes is not itself permission to publish. A request to publish to specified tracks/site already authorizes those steps; do not ask again. Production is separate from internal and Alpha.
2. Inspect the worktree, current main, version files and pending migrations. Preserve other work. Prepare a concrete, tested release with consistent visible versions and notes, using the pinned npm toolchain.
3. Apply required backward-compatible migrations to the confirmed Fala database before deploying dependent API code. Use an established authorized connection; verify schema/defaults and account isolation without logging row data or credentials.
4. Publish the checked commit through the existing workflow. Monitor the website and `checks.yml`; the successful main check triggers `play-bundle.yml`. Do not launch a duplicate publisher while one is running.
5. If closed testing was requested, promote the exact verified internal version code with `play-store.yml`, `mode=promote-alpha`. Keep `replace_pending_review=false` unless replacing the identified pending review is explicitly authorized. On review conflicts or an uncertain commit, inspect current track state before retrying.
6. Verify the live site, successful internal upload and fresh-edit Alpha receipt. Read the separate release lifecycle: track `completed` can still mean Google review is pending. Never promise immediate tester availability from that field alone.
7. Save a non-secret dated receipt and report each target separately, with version/build, evidence links and remaining platform gates.

For documentation-only work, follow the runbook's separate path to avoid publishing an unnecessary Android build. Missing credentials or a sandbox denial are specific blockers; finish unaffected work and name the exact remaining action without searching other credential stores.
