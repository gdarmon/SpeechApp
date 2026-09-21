# Fala publishing status — 21 September 2026

- **Android internal testing:** Fala 0.12.1, build 102601, accepted with status `completed`. [Verified upload](https://github.com/gdarmon/SpeechApp/actions/runs/35588233686).
- **Website/API:** 0.12.1 deployed and checked on falachatapp.netlify.app. AI reports work with browser cookies and Android bearer authentication. Temporary verification data was deleted.
- **Store package:** 15 native screenshots across three device sizes, icon, feature graphic, English listing copy, reviewer instructions and setup/test guides are prepared. Image sizes, content hashes, text limits and screenshot versions are validated.
- **Store metadata upload:** not saved. [Upload attempt](https://github.com/gdarmon/SpeechApp/actions/runs/35589346128) failed at final edit validation with HTTP 403, `The caller does not have permission`. The uncommitted edit was deleted. The existing store listing and closed-test draft were left unchanged.
- **Next upload step:** grant the publishing service account **Manage store presence (store listings, pricing, and distribution)** for Fala in Play Console, then rerun **Prepare Google Play store** with mode `upload`. Existing internal-testing permissions/signing credentials should be retained.
- **Public release:** not submitted. Production access is unavailable. Complete the Console declarations, sign-in access check and social-content moderation work described in `console-answers.md`, then run the required closed test before applying for production access.

This is a dated receipt, not a claim that Google has approved production. Check a later workflow receipt before repeating an upload.
