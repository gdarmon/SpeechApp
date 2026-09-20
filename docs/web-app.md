# Fala on iPhone, Android and the web

Share https://legendary-florentine-6b3c1f.netlify.app/app/ . Web 0.7.1 is separate from the native Android version. Netlify serves the public PWA and the same authenticated API/database. GitHub Pages alone cannot run this backend.

On iPhone, open Safari → Share → Add to Home Screen. Android Chrome offers Install app / Add to Home screen. HTTPS and microphone permission are required. Actual device permission, available voices and autoplay policies vary; the Listen button always offers explicit playback. Browser support was checked in desktop Chrome with a mobile viewport and synthetic microphone, not on a physical iPhone.

## One Google configuration check

In the existing **Web application** OAuth client, add this **Authorized JavaScript origin**:

```
https://legendary-florentine-6b3c1f.netlify.app
```

Use the same Google project and web client ID already configured in `GOOGLE_WEB_CLIENT_ID`. This GIS callback flow needs no redirect URI. Add a future custom domain separately before using sign-in there. Deploy-preview domains are not automatically authorized.

The website exchanges Google's nonce-bound ID token for a Secure, HttpOnly, SameSite=Lax `__Host-fala` cookie. No bearer token goes into browser storage or a URL. Google’s sign-in button injects a stylesheet, so the CSP permits inline styles; inline scripts remain prohibited. Cookie-authenticated mutations require the same Origin; Android bearer authentication is unchanged. The age eligibility checkbox is a self-declaration, not verified age assurance.

## Voice and cost

The website uses MediaRecorder (MP4 on Safari; WebM where supported), not browser speech recognition. Hold to record, release to transcribe, review/edit, then explicitly send. Recording stops on cancellation, backgrounding or 45 seconds, and audio uploads are capped at 2 MB. No audio is saved in Fala's database or application logs.

Online voice requires the existing paid OpenAI configuration (`FALA_OPENAI_API_KEY`, or an OpenAI endpoint/key in the compatible settings). Transcription uses `gpt-4o-mini-transcribe`; replies use `gpt-4o-mini-tts` with a Brazilian Portuguese instruction. Each suggested answer has Listen and Slower buttons for Portuguese pronunciation. Replaying a phrase at either speed reuses its audio for the current turn. Only the signed-in learner’s saved replies and suggested answers can be synthesized; clients cannot submit arbitrary text for playback. Existing per-user/global budgets include voice requests; a full spoken exchange costs additional requests and provider usage. The Android speech engine remains unchanged.

The direct family link is https://legendary-florentine-6b3c1f.netlify.app/app/#family . It opens without an account lookup.

Family practice has three prepared ten-exchange capoeira conversations, local recording/replay, device voice reading, Hebrew/English support and up to five review terms. It makes no AI calls and uploads no recordings. It does not grade the child or advance an AI level. A device voice may need downloading or a network connection. Only public files are cached for reopening offline; online conversations always need a connection.

## An 11-year-old cannot find the Play app

Adding an email to Internal testers does not itself enroll that account. In Play Console → Test and release → Internal testing → Testers, copy the **opt-in link**. Open it on the child's device in the child's listed Google account, join the test, then follow its download link. The browser and Play Store must use the same tester account. Check that the tester list is selected/saved and the release is available, not a draft. Do not substitute an Internal app sharing link or search the store for an unpublished test.

If it still does not appear, inspect the exact Play message, device compatibility, Family Link restrictions/parent approval and the app's target-audience settings. Do not change a birthday or use an adult identity to bypass restrictions. Changing the target audience to include children is a product/policy decision and requires meeting Google's Families requirements; it is not a code fix. This update does not change Play Console audience settings or claim to have fixed Play installation.

Use the website's **Family practice** with the child in the meantime. Online AI handling of under-13 personal data requires OpenAI's approved Zero Data Retention plus appropriate child safeguards before enablement. `store:false` alone is not that approval. No such approval has been verified for this project.

References: [Google internal testing](https://support.google.com/googleplay/android-developer/answer/9845334), [Google target audience](https://support.google.com/googleplay/android-developer/answer/9867159), [Family Link app controls](https://support.google.com/families/answer/7103028), [OpenAI under-18 guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance).
