# Fala publishing status — 27 September 2026

Current 0.15.0 publication is recorded in [the release receipt](../../docs/releases/0.15.0.md). Subsequent [Vercel-only hosting maintenance](../../docs/netlify-retirement-2026-09-27.md) retires Netlify without replacing the Android build.

- **Website/API:** [Fala 0.15.0 on Vercel](https://fala-api.vercel.app/app/), including the rotating recent-practice card. Exact source/deployment and checks are in [the release receipt](../../docs/releases/0.15.0.md).
- **Internal Testing:** **0.15.0 (104601)**, uploaded at 12:46 UTC. [Publisher](https://github.com/gdarmon/SpeechApp/actions/runs/36319940311).
- **Closed Alpha:** the same build was committed and independently verified at 12:47 UTC; its separate lifecycle was **IN_REVIEW**. [Promotion](https://github.com/gdarmon/SpeechApp/actions/runs/36320143895). The previous 0.14.4 release was `PUBLISHED` at that observation.
- **Production/store metadata:** unchanged. This release did not publish Production, replace a pending review, or upload new listing text/screenshots.

The actual hosting cutover was 0.14.4; the owner chose 0.15.0 as the recognizable Vercel milestone. Track `completed` is not proof of Google review approval or immediate installation availability. Use [the release runbook](../../docs/releasing.md) for another release.

## Earlier 0.14.4 receipt — 27 September 2026

- **Website/API:** [Fala 0.14.4 on Vercel](https://fala-api.vercel.app/app/); Netlify is now disabled; use the Vercel URL directly. Exact source/deployments and checks are in [the release receipt](../../docs/releases/0.14.4.md).
- **Internal Testing:** 0.14.4, build **104501**, uploaded successfully. [Publisher](https://github.com/gdarmon/SpeechApp/actions/runs/36316041019).
- **Closed Alpha:** the same build was committed and independently verified at 11:37 UTC. Its separate lifecycle was **IN_REVIEW**. [Promotion](https://github.com/gdarmon/SpeechApp/actions/runs/36316285927). Do not equate track `completed` with review approval.
- **Production:** unchanged; no production rollout was requested or performed.
- **Store metadata/screenshots:** the bundle promotion did not upload new listing text or screenshots. Canonical website/privacy/deletion URLs in the Console guide now use Vercel; old Netlify links are offline. Recheck actual Console permissions and listing state before another metadata upload.

Read [the release runbook](../../docs/releasing.md) before publishing. The earlier store-package receipt below is retained as history; its permissions or screenshots are not proof of current Console state.

## Historical receipt — 21 September 2026

- **Android internal testing:** Fala 0.12.3, build 103001, accepted with status `completed`. [Verified upload](https://github.com/gdarmon/SpeechApp/actions/runs/35594213764).
- **Website/API:** 0.12.3 deployed at commit `94234de`; public version, service-worker cache and automatic-retry module verified on falachatapp.netlify.app. A live ten-turn capoeira conversation, idempotent retry and five-word summary passed, including automatic recovery from Groq quota pauses. Temporary test data was deleted.
- **UI fix verified:** rounded suggestion tap targets now leave room around Portuguese, English and Hebrew text. [Native emulator captures](https://github.com/gdarmon/SpeechApp/actions/runs/35590193387) include the reported Rasteira/Banda example and longer answers. Required release checks passed.
- **Store package:** 15 native 0.12.2 screenshots across three device sizes, icon, feature graphic, English listing copy, reviewer instructions and setup/test guides are prepared. Image sizes, content hashes, text limits and screenshot versions were validated for 0.12.2. Refresh the native captures for the current version before the next metadata upload.
- **Store metadata upload:** not saved. [Upload attempt](https://github.com/gdarmon/SpeechApp/actions/runs/35589346128) failed at final edit validation with HTTP 403, `The caller does not have permission`. The uncommitted edit was deleted. The existing store listing and closed-test draft were left unchanged.
- **Next upload step:** grant the publishing service account **Manage store presence (store listings, pricing, and distribution)** for Fala in Play Console, then rerun **Prepare Google Play store** with mode `upload`. Existing internal-testing permissions/signing credentials should be retained.
- **Public release:** not submitted. Production access is unavailable. Complete the Console declarations, sign-in access check and social-content moderation work described in `console-answers.md`, then run the required closed test before applying for production access.

This is a dated receipt, not a claim that Google has approved production. Check a later workflow receipt before repeating an upload.
