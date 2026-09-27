# Google sign-in setup for Fala

Users install Fala, sign in with Google, and tap Talk. The app already knows `https://fala-api.vercel.app`. Users never enter a server address, API key, or shared token. All verified Google accounts are accepted; each account has separate conversations and progress. Google Workspace administrators can still restrict third-party apps.

These are one-time **publisher** steps. Play Console and Google Cloud setup require access to the developer's Google account; a Play Console URL alone does not grant that access.

## 1. Google Cloud

Open [Google Auth Platform](https://console.cloud.google.com/auth/overview), select or create a project for Fala, and configure:

- App name: **Fala**.
- Audience: **External**. During initial testing, add tester emails; before broad distribution, switch to production and complete any verification Google requests.
- Support/developer email: **gdarmon@gmail.com**.
- Homepage: `https://fala-api.vercel.app/`.
- Privacy page: `https://fala-api.vercel.app/privacy.html` (deploy the page before submitting).
- Authentication only: `openid`, `email`, `profile`; no Gmail, contacts, or Drive access.
- Register/verify the domain required by Google's branding flow. If the hosted Vercel subdomain cannot satisfy ownership verification, attach a domain you own before production verification and update the Android URL and OAuth origin together.

Create an OAuth client of type **Web application** in this project. Add the authorized JavaScript origin `https://fala-api.vercel.app` for the web account-deletion page. This app uses a JavaScript callback, so there is no redirect URL to register. Copy the public ID ending in `.apps.googleusercontent.com` into Vercel's `GOOGLE_WEB_CLIENT_ID` environment variable. **No Google client secret is used or needed.**

Create an OAuth client of type **Android**, in the same Cloud project:

- Package: `com.fala.app`.
- Certificate SHA-1: use the **debug** fingerprint in the locally generated `artifacts/google-android-registration.txt` when testing the local APK.
- For installs from Google Play, register another Android client with the **App signing key certificate SHA-1** from Play Console → App integrity → App signing. This normally differs from the upload key. Using the upload certificate alone will not enable sign-in for Play-delivered installs.

[Android setup](https://developer.android.com/identity/sign-in/credential-manager-siwg), [Google web client setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

GitHub Actions uses a fresh debug key unless the repository secret `FALA_DEBUG_KEYSTORE_BASE64` contains the base64 of your existing local debug keystore. Register the signer of the APK you actually install; for Play testing, always use the Play app signing certificate.

## 2. Backend

Use the same PostgreSQL database that serves the current app. Apply these files in order, through the database owner's SQL editor or the deployment's migration system:

1. `supabase/migrations/202609180001_fala.sql`
2. `supabase/migrations/202609180002_google_sign_in.sql`
3. `supabase/migrations/202609190001_repair_serialized_json.sql`

The second migration preserves old single-learner records in a separate legacy operator account. It never gives historical data to the first Google user. New conversations require a user ID; retry IDs are unique within each account. Back up existing data before applying production schema changes.

Set `GOOGLE_WEB_CLIENT_ID`, `DATABASE_URL`, and the AI provider configuration described in [deployment](deployment.md). `FALA_TOKEN` is optional, random 32+ character operator access to diagnostics and legacy records; omit it if you don't need that access. Short old tokens are ignored when Google is configured. Never distribute operator credentials to users.

The current deployment explicitly disables the daily user/app allowances (`0`) and retains the per-account flood guard. Provider billing and throughput limits are separate. Sign-in has database-backed IP/global limits using the hosting adapter's trusted client address. Preserve the existing database and Google client ID across hosting moves.

For the 0.14.4 migration, add the new origin to the existing **Fala backend** Web application client. Netlify has since been disabled; its old authorized origin is no longer required and can be removed from the Web client. Do not remove the Android OAuth clients. The owner confirmed adding the new origin; the button loaded successfully, but that check did not perform a real account login.

## 3. Verify before inviting people

- `GET /auth/config` returns the public Google web client ID without secrets.
- A fresh APK shows Google sign-in, with no server/token fields; closing the chooser leaves the welcome screen usable.
- Sign in as two different accounts. Each starts with its own empty history. Speak, close/reopen, sign out, and switch accounts; neither should see the other's data.
- Repeat from the Google Play internal-testing install, because its signing certificate differs from the local debug APK.
- Open `/delete-account.html` in a browser, verify the Google button loads, and delete a test account after explicit confirmation. Existing device sessions must stop working.
- Complete the [phone checklist](device-checks.md), including actual Google sign-in, microphone, pt-BR voice, and network failure behavior.

Device sessions expire after 90 days. Android encrypts the bearer credential with Keystore and binds it to the built-in server origin. The server stores only its hash. Sign-out revokes that device when online and always removes local access; if offline, the server credential remains valid until expiry or account deletion. Account deletion revokes all devices and removes the active account and learning data; backups/provider logs follow their own retention settings.

### Website on iPhone and Android

The web client now also serves the PWA at `/app/`. Its **Authorized JavaScript origins** must include `https://fala-api.vercel.app` (no path). The Google Identity Services callback uses no redirect URI. The web session is an HttpOnly cookie; Android still uses its existing device credential. See [the web app guide](web-app.md) for voice and installation.
