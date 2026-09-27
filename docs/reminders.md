# Reminder operations and Web Push keys

Current configuration: Fala 0.14.4, 27 September 2026. For publication evidence see [the release receipt](releases/0.14.4.md); for account-level defaults see [localization](localization.md). This document contains variable names and procedures, never secret values.

## What was done during the Vercel migration

The former Netlify `FALA_VAPID_PRIVATE_KEY` was unavailable through the authorized connection. A **new matching Web Push key pair was generated and installed in the Production environment of Vercel project `fala-api`**, alongside the other authorized server settings. The private key was not committed, printed or embedded in the application. No further copy from Netlify is required for this release.

The new public website is `https://fala-api.vercel.app/app/`. Browser sign-in cookies, notification permission and subscriptions belong to an origin; users must sign in and connect notifications on the new site. An existing permission on the old Netlify origin is not permission on Vercel. Keep the new pair stable for future releases: generating another pair on every deployment would break subscriptions again.

Account reminder preferences remain in the same database. Enabled reminders default to 17:00 in the learner's selected time zone; existing custom times and opt-outs are preserved. Android schedules local WorkManager notifications and does not use the VAPID private key. Both clients still use the shared account/date claim to avoid duplicate reminders.

## Settings and their owners

| Setting | Where it belongs | Purpose |
|---|---|---|
| `FALA_VAPID_PUBLIC_KEY` | Vercel `fala-api`, Production | Public application key used when subscribing a browser; deliberately available to signed-in web clients |
| `FALA_VAPID_PRIVATE_KEY` | Vercel `fala-api`, Production, secret | Server-side Web Push authentication; never put it in browser assets, Android, Git, chat or logs |
| `FALA_REMINDER_TOKEN` | Vercel `fala-api`, Production **and** GitHub repository Actions secrets | Dedicated random 32+ character secret authenticating the scheduler; both values must match |
| `DATABASE_URL` | Vercel `fala-api`, Production, secret | Existing private Fala database; do not create a second learner database for reminders |

The VAPID private key and reminder token are different secrets with different purposes. The scheduler does not need the VAPID key or a database password. Do not use the operator `FALA_TOKEN` for scheduled delivery.

The configured pair is already present. On a new workstation, establish normal access to the authorized Vercel project; do not search unrelated projects or attempt to recover a masked key through logs. Keep a separately authorized, secure owner backup if operational policy requires one; this repository is not that backup. Changing Vercel environment variables requires a new deployment to activate them.

## Scheduling and delivery

`.github/workflows/reminders.yml` runs on the default branch at minutes **07, 22, 37 and 52 of each UTC hour**. It sends an authenticated POST to `https://fala-api.vercel.app/internal/reminders`. GitHub schedule timing is best effort; the user-selected reminder time is evaluated in the account's time zone. A 17:00 preference is not a guarantee of delivery exactly at 17:00.

The workflow has one concurrency group, a two-minute job timeout and a 35-second HTTP deadline. The server accepts POST only, checks the dedicated token and requires both VAPID settings before delivery. The entire Netlify project is disabled; it no longer serves even the retired reminder endpoint. Do not run two schedulers during normal operation.

`src/reminders.ts` processes at most 20 eligible learners per invocation with four concurrent workers and a four-second push timeout. Eligibility requires:

- Reminder enabled, within one hour after the chosen local time.
- No saved eligible Portuguese reply that local day.
- No existing account/date reminder claim.
- A subscription tagged with the current VAPID public key.

The newest matching subscription is selected. New registrations store the key association in subscription JSON; old or differently tagged subscriptions are excluded. At most three browsers may be connected under the current key. Failed sends release the date claim; expired subscriptions returning 404/410 are removed. The source remains authoritative for edge cases and failure handling. Bounded batch capacity and schedule delays should be reviewed before expanding the audience. No AI call is needed for delivery.

## Verification without notifying learners

Run the normal backend and web checks. They cover token/method/key guards, mismatched-key exclusion, reminder eligibility/deduplication and browser permission behavior with isolated fixtures. A live GET to the delivery route returns 405; that checks routing, not successful delivery. Read Vercel variable **names/presence**, not values, to check configuration.

Observe the next normal **Deliver Fala reminders** run in GitHub Actions. A successful result with `delivered: 0` can be correct when no user is eligible; it does not prove a browser displayed a notification. A failed run should report its HTTP status without credentials or subscription endpoints. Real-device notification appearance, permission and background behavior need a consented test device/account.

A manual workflow dispatch or authenticated POST can send real due reminders. It is not a read-only health check and has no dry-run mode. Do not probe it casually or claim delivery from an isolated test. The 0.14.4 receipt distinguishes configured keys, isolated checks and any observed scheduled run.

## If a reminder is missing

| Observation | Check |
|---|---|
| Workflow reports missing scheduler credential | GitHub Actions secret `FALA_REMINDER_TOKEN` exists in the intended repository |
| HTTP 401 | GitHub and the deployed Vercel token match; do not print either value |
| HTTP 503 | Dedicated token length and both VAPID variables are configured in Production, followed by deployment |
| HTTP 200, zero delivered | Current-key subscription, enabled preference, local time window, practice today and existing account/date claim |
| Old website had permission, new website does not | Sign in and enable browser notifications on the new Vercel origin; preserve account opt-outs |
| Browser permission was denied | The user must change that site's browser/OS permission; the app cannot grant it |
| Browser subscription stopped working after key rotation | Reconnect the browser with the matching public key; do not relabel an old subscription as a new one |
| Android reminder missing | Check Android notification permission, WorkManager/battery behavior and shared account/date eligibility; replacing VAPID will not fix Android scheduling |

On iPhone/iPad, use the supported Home Screen web-app flow described in [web setup](web-app.md). No delivery exactly on time is guaranteed by this scheduler or by mobile operating systems.

## Future key rotation or recovery

1. Confirm the affected project and reason. Keep the current pair for routine releases. If the private key is irretrievable or compromised, replacing it is a deliberate migration requiring new browser subscriptions.
2. Generate one matching pair using the existing `web-push` library in a trusted process and transfer it directly into the authorized Vercel Production settings. Never log it or write it into a tracked file. Preserve the pair through the owner's approved secure storage process.
3. Set both public and private values together, then deploy the reviewed application. Do not alter learner reminder times, re-enable opt-outs, or copy another project's pair.
4. Reconnect consenting test browsers, verifying that the client actually obtains a subscription for the new public key. Ordinary releases do not need this step. A future same-origin rotation needs an explicit client reconnection path; merely changing server environment variables is insufficient.
5. Observe normal scheduled runs and verify a consented test-device notification. Record the date, affected origin, deployment and results without keys or subscription endpoints.

To rotate only `FALA_REMINDER_TOKEN`, update its Vercel and GitHub values as one coordinated operation and redeploy. The VAPID pair and browser subscriptions need not change.
