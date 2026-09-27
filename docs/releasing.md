# Fala release runbook

Use this for an existing Fala installation, website and Play app. For first-time account setup see [deployment](deployment.md), [Google sign-in](google-sign-in.md) and [Google Play](google-play.md). The examples run from the repository root unless stated otherwise. Replace example version/run IDs with the verified current values.

## Targets and ownership

| Target | Existing identity | Publication path |
|---|---|---|
| Source | `gdarmon/SpeechApp`, branch `main` | GitHub |
| Website/API | `https://fala-api.vercel.app`, app at `/app/` | Reviewed staged Vercel production deployment |
| Database | Private `fala` schema in the configured PostgreSQL/Supabase database | Reviewed SQL migrations, separately from site deployment |
| Android identity | `com.fala.app` | Existing signing key and Play App Signing |
| Internal testing | Play API track `internal` | `.github/workflows/play-bundle.yml` |
| Closed testing | Existing Play API track `alpha` | Manual `play-store.yml` promotion of the internal bundle |
| Production | Separate Play track | Outside the normal workflow; do not infer authorization |

Website, database and Android are separate deployables. A website deployment does not replace an installed Android binary. Server-only behavior reaches existing clients without reinstalling; native interface changes need the new Play build.

## Access without copying secrets into the repository

Use an existing authorized `gh` login for the correct account/repository and Vercel's normal login/project connection. Netlify is retired and no longer needed for builds, credentials, diagnostics or publication. A fresh machine must log in normally. Existing signing and Google publishing credentials are already stored in GitHub Actions:

- Secrets: `FALA_UPLOAD_KEYSTORE_BASE64`, `FALA_UPLOAD_STORE_PASSWORD`, `FALA_UPLOAD_KEY_ALIAS`, `FALA_UPLOAD_KEY_PASSWORD`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
- Variables: `FALA_PLAY_UPLOAD_ENABLED=true`, normally `FALA_PLAY_RELEASE_STATUS=completed`.
- `FALA_DEBUG_KEYSTORE_BASE64` is an optional separate debug key; it is not the Play upload key.

Vercel `fala-api` Production holds `DATABASE_URL`, optional `DATABASE_CA_CERT`, Google public client ID, AI credentials/selectors and optional Web Push keys. `.env.example` lists names and meanings. Do not dump environment values or a complete provider response into logs. A masked secret is not recoverable just because another tool is connected. `FALA_REMINDER_TOKEN` must match the GitHub Actions secret of the same name; the scheduled workflow calls only the dedicated reminder endpoint. Keep the existing VAPID key pair for normal releases. A deliberate key rotation requires new browser subscriptions and must preserve opt-outs.

Database migration requires an approved owner/migration connection supplied securely by the owner, preferably through Supabase SQL Editor or an existing PostgreSQL credential configuration. Do not fetch it from the retired Netlify account. The isolated fixture tool accepts `FALA_MIGRATION_DATABASE_URL` from the environment and verifies the confirmed Fala pooler identity before using the private diagnostic schema. Do not place credentials in a command argument, source file or logs.

The `.tools/` and `artifacts/` directories are ignored conveniences. [The handoff](agent-handoff.md#existing-workstation-conveniences) documents the local CLI locations; the release must remain possible without those directories.

## 1. Prepare a concrete release

Inspect `git status`, fetch `origin`, and check current main and recent successful release receipts. Resolve concurrent changes without force-pushing over them. Keep a task branch for the work.

Use Node from `.nvmrc` and npm 10.9.7. For an example next patch:

```bash
FALA_NEXT_VERSION=0.15.1
npx --yes npm@10.9.7 version "$FALA_NEXT_VERSION" --no-git-tag-version
```

That updates `package.json` and the package/root entries in `package-lock.json`. Also update:

1. Android `versionName` and increment the fallback `versionCode` in `android/app/build.gradle.kts`.
2. `Web X.Y.Z` in `public/app/index.html`.
3. `fala-web-X.Y.Z` cache name in `public/app/sw.js`.
4. New `releases/X.Y.Z.txt`: concise user-facing English notes, 1–500 characters. Keep prior notes.

CI allocates the actual Play version code; do not replace its allocation with the small local fallback. The formula is `100000 + run_number × 100 + run_attempt`. Reruns therefore receive a new code. Codes are monotonic and cannot be reused/downgraded in Play.

For UI copy changes, edit `locales/he.json` and run `node scripts/localization.mjs`; commit both generated catalogs. Include new public modules in the service-worker shell where appropriate. For data changes, add a reviewed, backward-compatible migration and tests. Record any deployment ordering requirement.

## 2. Verify before pushing

```bash
npx --yes npm@10.9.7 ci
npm test
npm run build
npm run test:web
git diff --check
```

`ci` with npm 10.9.7 is required before pushing a release. The pinned npm version keeps local and CI lockfile handling consistent. Do not regenerate the lockfile with npm 12 to work around a build sandbox failure.

For native changes, from `android/`:

```bash
./gradlew --no-daemon :app:testDebugUnitTest :app:assembleDebug :app:lintDebug
./gradlew --no-daemon :app:compileDebugAndroidTestKotlin
```

Use relevant device acceptance checks for changes that cannot be validated locally. Report missing phone/emulator coverage honestly. The signed publishing workflow also runs tests, a release build and release lint. `npm run build` checks version/notes/catalog consistency; CI also stages, installs and type-checks the self-contained Vercel package. Run `node scripts/prepare-vercel-api.mjs`, then `npm ci` and `npm run typecheck` inside the returned stage to reproduce that check.

## 3. Apply required migrations before dependent API deployment

First identify which migrations are already installed in the intended Fala database. These checked-in files are not automatically applied by `npm run build`, GitHub Actions or Vercel deployment. Do not blindly rerun all historical migrations against a live account store.

Apply the pending reviewed SQL in a transaction through the owner's SQL Editor or a secured PostgreSQL connection. For example, with an existing libpq service/credential configuration and `PGSERVICE` set securely:

```bash
psql --no-psqlrc --set ON_ERROR_STOP=1 --single-transaction \
  --file supabase/migrations/202609250001_language_reminders.sql
```

The example is the 0.14.0 migration, not a file to reapply for every future release. It adds `ui_language`, enables reminders once for existing disabled accounts at 17:00, preserves already-enabled custom times, and makes new profiles default-on. Its marker preserves later opt-outs on reruns.

Verify expected columns/defaults and that RLS and denied `anon`/`authenticated` access remain intact. For a data backfill, check expected counts/invariants without exporting user rows. Record the filename and verification time. If the migration fails, keep the previous API live until the dependency is resolved. Additive schema can normally remain when rolling back code; do not improvise a destructive rollback.

For the 0.14.0 schema, these read-only checks reveal metadata, not account rows:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'fala' AND table_name = 'reward_profiles'
  AND column_name IN ('ui_language', 'reminder_defaults_applied',
                      'reminder_enabled', 'reminder_minute');

SELECT relrowsecurity AS rls,
  has_table_privilege('anon', 'fala.reward_profiles', 'SELECT') AS anon,
  has_table_privilege('authenticated', 'fala.reward_profiles', 'SELECT') AS authenticated
FROM pg_class WHERE oid = 'fala.reward_profiles'::regclass;
```

Expect the two new columns, enabled default `true`, minute default `1020`, and permission flags `true/false/false`. This schema check does not replace verification of the particular migration's backfill invariants.

## 4. Publish the checked commit

### Vercel primary deployment

The owner authorized `fala-api` in team `gdarmon-4173`. Use the established Vercel login or sign in on a fresh machine. Do not disable this project's deployment protection; its stable production alias is public under the current account defaults. Do not copy credentials to other projects implicitly.

1. Apply any required database migration, finish the checks, and record the reviewed source SHA.
2. Run `node scripts/prepare-vercel-api.mjs`. It returns a new ignored staging directory containing only reviewed TypeScript sources, public assets, package files and deployment configuration. It excludes environment files and local credentials.
3. Link that exact stage: `vercel link --cwd STAGE --project fala-api --scope gdarmon-4173 --yes`.
4. Deploy: `vercel deploy --cwd STAGE --scope gdarmon-4173 --prod --yes`. Record the Ready deployment ID and source SHA in the receipt. The GitHub branch is not automatically deployed to Vercel by this repository.
5. Verify the stable alias's `/health`, `/app/`, `/auth/config`, unauthenticated `/dashboard` rejection, service-worker version, and any changed authenticated path. Google login requires this origin on the existing **Fala backend** Web OAuth client.
6. For a bounded full-session check, the operator-only adapter may temporarily use `FALA_SESSION_DIAGNOSTICS=true` with dedicated synthetic accounts in `fala_latency_probe`. Run `scripts/check-hosted-sessions.mjs` with its explicit opt-in and private manifest, retaining sanitized aggregate results only. Disable this flag and redeploy before normal traffic cutover. Do not test with a real learner's history.
7. `scripts/prepare-session-fixtures.mjs --cleanup artifacts/session-fixtures-UUID.json`, with its explicit `FALA_PREPARE_SESSION_FIXTURES=true` opt-in, removes only that run's synthetic users. Remove the private manifest after cleanup.

The 0.14.4 cutover installed a new matching Web Push pair in Vercel Production and the protected reminder workflow on main, and retired the Netlify scheduler. Normal releases keep the key and scheduler unchanged. Observe a scheduled `reminders.yml` run and record its result. A manual invocation can send real due reminders; use isolated sender tests for a non-delivery check. See [reminder operations](reminders.md).

### Main and Android publication

Once publishing the intended targets is authorized, merge/push the checked source to main using the repository's normal process. In this repository the maintainer has also used an authorized fast-forward push:

```bash
git push origin HEAD:main
git push -u origin YOUR_TASK_BRANCH
```

Use the actual branch name in the second command. A rejected non-fast-forward push means main advanced; inspect and reconcile it rather than forcing. A PR is appropriate when review is required, but opening a PR alone does not publish this app.

Do not advance main again while its Play publication is in progress: the publisher deliberately checks current main before building and before upload, and skips superseded commits.

The normal sequence is:

1. Verify the separately staged Vercel production deployment. Netlify is disabled and receives no deployments.
2. GitHub **Build and check Fala** (`checks.yml`) checks backend/web, real PostgreSQL compatibility and Android.
3. After a successful **push-to-main** check, **Publish Play internal testing** (`play-bundle.yml`) builds with the existing signing key and uploads `internal` when enabled.

No closed-test promotion or production rollout is automatic. Merely seeing a successful `pages-build-deployment` run is not evidence that the Vercel API or Play release is updated.

## 5. Monitor and verify the website and Internal Testing

```bash
gh run list --branch main --limit 8
gh run view CHECK_RUN_ID
gh run watch PLAY_RUN_ID --interval 20 --exit-status
gh run view PLAY_RUN_ID --log
```

Use numeric run IDs returned by `gh run list`, matching the full source SHA. Save a sanitized receipt or retain the run URL. The publisher prints the visible version, allocated Play code, upload result and bundle SHA-256. A green job that says it skipped a superseded commit is not an upload confirmation.

The internal publisher verifies Google's returned bundle version/hash and commits only the internal track. It refuses a used/older code and fails if Google reports a conflicting pending review. On an uncertain network/commit result, inspect Play before retrying.

Verify the primary Vercel deployment is Ready on the intended source commit. Then check:

```bash
curl --fail --silent --show-error https://fala-api.vercel.app/health
curl --fail --silent --show-error https://fala-api.vercel.app/app/
curl --fail --silent --show-error https://fala-api.vercel.app/app/sw.js
```

The old Netlify URLs intentionally return 404. Do not restore forwarding or deploy a compatibility site.

`/health` returns `{"status":"ok"}`; it does **not** expose a version or prove database/AI health. Check the visible web version, cache name and changed public modules separately. For localization, exercise language switching in the live browser. Perform any authenticated smoke check with an authorized test account and without logging transcripts or credentials.

If automatic publishing is disabled or a run was skipped, establish the reason first. A manual internal workflow is available on current main:

```bash
gh workflow run play-bundle.yml --ref main
```

It allocates a **new** Play build. Do not start it while another publisher is running or use it simply to recheck a successful upload.

## 6. Promote the same bundle to Closed Testing

Only after the internal upload is verified, use its exact version code:

```bash
gh workflow run play-store.yml --ref main \
  -f mode=promote-alpha \
  -f version_code=104001 \
  -f replace_pending_review=false
```

`104001` is the historical 0.14.0 example. For the next release substitute the new confirmed code. The checkout's visible version and notes must still match that bundle.

The workflow runs `scripts/play-promote.mjs`, which requires an exact completed internal match, updates only existing `alpha`, validates and commits, then reads a fresh edit to verify persistence. It reuses the uploaded bundle; it does not rebuild, change production, alter testers or upload store screenshots.

Monitor the new **Prepare Google Play store** run, then download its receipt:

```bash
gh run watch CLOSED_RUN_ID --interval 20 --exit-status
gh run download CLOSED_RUN_ID --name play-store-receipt \
  --dir artifacts/closed-release-receipt
```

Read `promotion-alpha.json`: `version`, `versionCode`, `verified`, `after` track releases and `releaseLifecycles`. An API track release with `status: completed` may still have lifecycle `IN_REVIEW`; that is not `PUBLISHED` and not guaranteed tester availability. If the lifecycle endpoint was unavailable, report the review state as unverified.

Keep `replace_pending_review=false` normally. If Google rejects due to an existing review, identify the pending changes and obtain authorization specifically covering their replacement before enabling that option. The replacement submits **all pending changes**, not just an isolated binary. A general instruction to update a track does not describe those unrelated pending changes.

## 7. Finish with a durable receipt

Create `docs/releases/X.Y.Z.md` containing:

- Version, source SHA, app identity and actual Play code.
- Website URL/deploy ID and verified public paths.
- Applied migration filenames and verification outcome.
- Check/internal/closed workflow URLs and statuses.
- Separate Google review lifecycle and its observation time.
- Behavior changes, test coverage and unverified physical-device limits.

Keep raw logs, private local credentials, downloaded bundles and screenshots in ignored artifacts unless a specific sanitized artifact belongs in version control. A concise summary should distinguish website live, internal uploaded, closed committed/review pending and production untouched.

## Documentation-only updates

A documentation or agent-instructions update alone needs no visible app version bump. Inspect the entire diff first: this route must not hide code, schema, dependency, workflow or published-asset changes.

This repository's workflows currently run on every push, and a successful main check triggers another internal upload. For a verified docs-only commit, use the skip marker:

```bash
git commit -m "Document Fala operations and agent handoff [skip ci]"
git push origin HEAD:main
```

GitHub's `[skip ci]` skips applicable push/PR checks; it does not stop manually dispatched workflows. Netlify is disconnected and disabled, so it needs no commit marker. If branch protection requires checks, use the repository's review process rather than bypassing it. [GitHub skip behavior](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs).

## Hosting maintenance without a new Android binary

Infrastructure retirement and hosting configuration corrections can retain the already published app version when no client feature or API contract changes. This is **not** the docs-only validation shortcut: run the full relevant backend/web checks and deployment-package validation. To avoid an unnecessary Play upload, push the task commit with `[skip ci]`, explicitly dispatch `checks.yml` on that exact task branch, and wait for success before merging. The existing publisher accepts only successful push-to-main checks; a manual check does not publish Play. Keep the skip marker on the main commit, deploy and verify Vercel separately, and record the checked SHA and manual run. Normal user-visible releases still require the version bump and normal publication sequence.

## Troubleshooting and recovery

| Observation | Action |
|---|---|
| Local esbuild/Gradle/browser gets `EPERM` or cannot bind a socket | Use the host's normal execution approval for that build/check; don't change app dependencies to compensate |
| `gh` says not logged in | Check the intended CLI config; on a fresh machine log in normally. Never print a saved token file |
| Website ready but native UI is old | Verify the Play build, tester account/track eligibility, review state and installation |
| Missing `ui_language` column / API schema failure | Check the required migration in the exact configured database before redeploying |
| Internal upload skipped because main advanced | Check the newer main run; do not force-upload the superseded commit |
| Used or older Play version code | Inspect tracks; use a new workflow allocation for a justified retry, not a reused bundle code |
| Alpha receipt says completed + IN_REVIEW | Wait for Google review; do not claim approval or restart uploads to bypass it |
| Pending review conflict | Identify pending changes; preserve the review unless explicit replacement is authorized |
| Notification default on but no notification | Check permission, time zone, active subscription/native scheduling, practice today and deduplication; no reminder exactly on time is guaranteed |
| Long response after Send | Measure `Server-Timing`, provider/repair retries and device playback separately; preserve the reply/request ID |

For a bad website/API release, promote a known compatible Vercel deployment and verify the stable alias. Netlify must stay disabled; a rollback uses Vercel. For Android, prepare a corrected release with a higher version code; do not attempt a version-code downgrade. Do not delete learner data or remove a new schema column merely to roll back the UI. Record the recovery and which clients are affected.
