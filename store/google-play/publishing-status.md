# Fala publishing status — 27 September 2026

- **Website/API:** [Fala 0.14.4 on Vercel](https://fala-api.vercel.app/app/); old Netlify URLs forward to it. Exact source/deployments and checks are in [the release receipt](../../docs/releases/0.14.4.md).
- **Internal Testing:** 0.14.4, build **104501**, uploaded successfully. [Publisher](https://github.com/gdarmon/SpeechApp/actions/runs/36316041019).
- **Closed Alpha:** the same build was committed and independently verified at 11:37 UTC. Its separate lifecycle was **IN_REVIEW**. [Promotion](https://github.com/gdarmon/SpeechApp/actions/runs/36316285927). Do not equate track `completed` with review approval.
- **Production:** unchanged; no production rollout was requested or performed.
- **Store metadata/screenshots:** the bundle promotion did not upload new listing text or screenshots. Canonical website/privacy/deletion URLs in the Console guide now use Vercel; existing Netlify links continue to redirect. Recheck actual Console permissions and listing state before another metadata upload.

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
