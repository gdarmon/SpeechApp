# Fala publishing status — 21 September 2026

- **Android internal testing:** Fala 0.12.2, build 102701, accepted with status `completed`. [Verified upload](https://github.com/gdarmon/SpeechApp/actions/runs/35590424000).
- **Website/API:** 0.12.2 deployed and the public version and service-worker cache checked on falachatapp.netlify.app. The AI-report functionality verified for 0.12.1 is unchanged.
- **UI fix verified:** rounded suggestion tap targets now leave room around Portuguese, English and Hebrew text. [Native emulator captures](https://github.com/gdarmon/SpeechApp/actions/runs/35590193387) include the reported Rasteira/Banda example and longer answers. Required release checks passed.
- **Store package:** 15 native 0.12.2 screenshots across three device sizes, icon, feature graphic, English listing copy, reviewer instructions and setup/test guides are prepared. Image sizes, content hashes, text limits and screenshot versions are validated.
- **Store metadata upload:** not saved. [Upload attempt](https://github.com/gdarmon/SpeechApp/actions/runs/35589346128) failed at final edit validation with HTTP 403, `The caller does not have permission`. The uncommitted edit was deleted. The existing store listing and closed-test draft were left unchanged.
- **Next upload step:** grant the publishing service account **Manage store presence (store listings, pricing, and distribution)** for Fala in Play Console, then rerun **Prepare Google Play store** with mode `upload`. Existing internal-testing permissions/signing credentials should be retained.
- **Public release:** not submitted. Production access is unavailable. Complete the Console declarations, sign-in access check and social-content moderation work described in `console-answers.md`, then run the required closed test before applying for production access.

This is a dated receipt, not a claim that Google has approved production. Check a later workflow receipt before repeating an upload.
