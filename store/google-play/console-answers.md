# Fala: Play Console setup answers

Prepared for Fala 0.12.1, 21 September 2026. These are answers grounded in the current code, not a claim that the owner has already submitted the forms. API access cannot read or complete all App content declarations or the account's production-access application.

## Confirmed account state

The owner reports that production access is unavailable. The API audit found only a title in the English listing, no graphics, an empty alpha/closed-testing draft and a completed internal release. Internal testing does not satisfy Google's required closed test. Complete the app setup, recruit at least 12 eligible testers, keep them opted in to closed testing for 14 continuous days, then apply from Dashboard. Approval is not automatic after 14 days.

## Store settings

- App: Fala: Speak Portuguese. Category: Education. Language: English (United States).
- Support email: gdarmon@gmail.com
- Website: https://falachatapp.netlify.app/
- Privacy: https://falachatapp.netlify.app/privacy.html
- Account deletion: https://falachatapp.netlify.app/delete-account.html
- Ads: No. The app includes no advertising SDK or advertisements.
- App access: Some or all functionality is restricted; Google sign-in is required. Use the instructions in app-access.txt.
- Intended audience: 13–15, 16–17, and 18+. Current online service is not enabled for under-13 use. This audience setting is separate from the IARC content rating.
- Category tags: Choose the available tags matching education/language learning. Do not select unrelated tags for exposure.
- Financial features, health features, news and government affiliation: None in the current product.
- Pricing/distribution countries: Owner decision in Console. No in-app purchases or subscriptions are implemented. Provider expenses are paid by the operator.

## Content rating

Complete the IARC questionnaire honestly from the actual features; the rating is assigned by IARC, not chosen by this checklist. Explain that this is a language-learning AI conversation app with sports/capoeira vocabulary and stylized characters. It has no gambling, ads, purchases or direct person-to-person chat. Learners can create nicknames and private circle names visible to circle members; do not declare there is no user-generated content. Review Google's UGC requirements for these limited social features before rollout, including handling reported names and blocking objectionable content. The new AI-report flow concerns AI replies and reviews, not social-user reports.

## Data safety — draft mapping for the Android binary

| Google category | Fala use | Collection / purpose |
| --- | --- | --- |
| Personal info: Email address | Google sign-in email | Required for account management and app functionality |
| Personal info: User IDs | Google subject, Fala user ID and device session | Required for account management, app functionality and fraud/security |
| Personal info: Name | Optional circle nickname | Optional; app functionality; visible to joined circle members |
| App activity: Other user-generated content | Conversation text, typed replies, optional report notes and circle names | Core conversation text is required for AI practice; reporting and circles are optional; app functionality and safety |
| App activity: App interactions | Learning history, practice time, XP, streak dates, settings | Required for saved progress and app functionality; optional reminder preferences |
| Audio: Voice or sound recordings | Optional network recognition by the phone's chosen speech service | Native Fala does not upload audio to its server. Review the system speech provider's handling and applicable system-service exception before finalizing this field; do not claim that no service can receive audio. The website's separate Groq transcription flow is not the native Android flow. |

Data is sent using HTTPS. Account deletion is offered in-app and on the web. No analytics/advertising SDK, advertising ID, contacts or device location permission is included. Time zone is used for reminders, not to determine location.

Conversation text goes to Groq; account and learning data are processed by Netlify and Supabase. Google handles sign-in. Android recognition and voice playback use the phone's speech services. OpenAI voice generation is currently for the website. Service-provider processing and deliberate sharing with circle members must be classified under Google's definitions; do not infer "not shared" merely because there is no sale of data. No application transcript is logged by Fala; provider operational logs/retention still apply.

Before submitting, confirm the current service-provider contracts and retention settings. Do not declare Zero Data Retention, ephemeral-only processing, an independent security review, or a fixed backup deletion deadline without evidence. Application records remain until the learner deletes them; reports are removed with their conversation/account. External logs and backups are governed by provider retention.

## AI assets and reporting

The original Fala logo and character artwork were generated with AI. The screenshots capture the actual Android UI with fictional examples. Follow the Console's asset-specific AI declaration for assets that contain generated artwork; do not imply these are photos of actual instructors. The banner's typography and speech bubbles are drawn from code.

AI replies: Conversation options → Report this AI reply. End-of-session review → Report this AI review. A category and optional note are sent privately to the operator. No email app is required. The operator must review and act on the report queue; see docs/content-reports.md.

## Remaining steps the API cannot complete here

1. Complete/confirm App content forms: privacy, ads, app access, target audience, content rating and Data safety. Clear any additional Console tasks shown for this account.
2. Verify Google OAuth Audience allows the intended testers, not only the owner. Follow the app-access instructions and test sign-in using a different account.
3. Choose closed-test countries and add the tester list in Console. Use the closed-track opt-in URL supplied by Console. Internal testers must also opt into the closed track.
4. Review and roll out the closed-testing draft after required forms are accepted. Share the opt-in link with at least 12 testers aged 13+, and gather genuine feedback. No invitations have been sent by this preparation.
5. After the continuous testing requirement is met, apply for production access with truthful answers about tester engagement, feedback, fixes and readiness. Then create/review the production release.

Sources: [store assets](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en), [closed testing](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en), [app access](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en-GB), [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en), [AI reporting](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en-GB), [UGC](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en), [AI asset declaration](https://support.google.com/googleplay/android-developer/answer/17262077?hl=en).
