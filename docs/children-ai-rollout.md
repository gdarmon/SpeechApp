# Fala: AI conversations for ages 8 and up — rollout plan

Plan last updated: 23 September 2026. This is an implementation specification, not an announcement that the service is open to children. The English translation preserves recorded findings and status; it is not a new verification of provider terms or account settings.

The decision: full AI conversations from age 8 with a parent-managed account, rather than only prepared phrases. Version 0.13.3 fixes playback; it does not enable use under age 13.

## Prerequisites before activation

1. **Suitable provider and verified privacy settings.** The live settings were checked: conversation and transcription use Groq. Documentation reviewed for this plan said customers could enable ZDR through Data Controls without OpenAI's approval process. Inspect and enable the setting in Fala's organization and verify its applicable agreement covers end users aged 8–12. The actual setting has not been verified. An alternative is a separate OpenAI child project with active Zero Data Retention approval and coverage for every model and endpoint used. There is no evidence of that approval for Fala. `store:false` is not a substitute. Verify Groq's applicable age and retention terms explicitly; do not rely on an archived agreement.
2. **Verified parental consent.** Google Sign-In proves account control, not parenthood or verified consent. A checkbox or Family Link installation approval does not automatically establish consent to conversation processing. A small pilot could consider a parent-verification video call with trained staff, after establishing the procedure, direct notice and applicable legal requirements. Alternatively select and activate a verification provider. Do not store identity documents or video in Fala.
3. **Distribution and countries.** After implementation and testing, update Play Console audience, privacy information, Data safety and reviewer instructions. The plan's review found Google Groups unavailable to personal accounts under 13. Plan a separate email-list testing route and test installation with a valid Family Link account before promising eligibility. Preserve the existing tester group.

## Planned app behavior

- A neutral age screen before sign-in, recording, AI services or account loading. Do not reveal which answer unlocks features or retain full birth dates when an age group suffices.
- Ages 8–12 proceed to a parent screen. Do not request the child's Google account, email, full name, school, location or sample recording. No accounts below age 8.
- The parent signs in, reads a processing/provider/retention/revocation notice, and completes verification and consent. Use a separate child profile with a nickname chosen from a list.
- Link a child's device with a short-lived one-time code from the parent. Limit attempts and allow cancellation/disconnection. The code cannot grant access to the parent profile.
- Portuguese conversation includes Hebrew/English support at a beginner-friendly pace. Explain that the partner is AI and can make mistakes. Keep Portuguese difficulty separate from capoeira knowledge.
- No friends, circle codes, social rankings or unrestricted sharing in child mode. Parents control reminders and support reports. No advertising, streak pressure or automatic log submission.
- Parents can pause practice, disconnect devices, review retained information, delete profiles and revoke consent. Revocation immediately blocks requests, including from connected devices.

## Server requirements

- Separate child profiles, parent ownership, notice versions, verification evidence, consent scope and pending / active / revoked states. Evidence comes from a verified process, not a phone-submitted flag.
- Check eligibility on conversation, transcription, playback, resume, memory, history, reminder and device-link requests. Unknown status or missing approval cannot activate AI. Child tokens cannot choose another parent/learner or access adult routes.
- A separately configured approved provider route with no fallback to adult providers. Keep keys server-side. Block before recording collection if no approved route exists.
- No arbitrary network recognition provider on a child's device. Require approved transcription or genuinely local recognition, with typing when unavailable. Playback uses an installed local voice or an approved service.
- Process audio briefly without retaining recordings. Define transcript/memory retention and implement automatic deletion before promising it. Retain learning memory, excluding detected personal information.
- Child-appropriate input/output checks, filtering of personal-information requests, inappropriate-content prevention and risk response/escalation. Model instructions alone are insufficient.
- Test isolation, forged age/consent, code expiry, revocation during use, deletion, provider failure, alternate routes and a Family Link device. Human reviewers check Hebrew and Portuguese content.

## Work status

- [x] Selected ages 8 and up and full AI conversations.
- [x] Reviewed Google Groups restrictions, Families policy and provider requirements.
- [x] Mapped sign-in, speech, sharing and retention.
- [ ] Approve provider routing and verify actual retention settings.
- [ ] Select and activate parental-consent verification.
- [ ] Implement parent/child accounts, authorization, content controls and deletion.
- [ ] Complete checks and Play submissions. Do not change the public age statement to 8+ yet.

## Official sources

- [OpenAI — Under-18 guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)
- [OpenAI — Data controls](https://developers.openai.com/api/docs/guides/your-data)
- [Groq — Data retention, including self-service ZDR](https://console.groq.com/docs/your-data)
- [Groq — Data Controls settings](https://console.groq.com/settings/data-controls)
- [Groq — Current services agreement](https://console.groq.com/docs/legal/services-agreement)
- [Google Play — Families policies](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en)
- [Google Groups — Join a group](https://support.google.com/groups/answer/1067205?hl=en)
- [FTC — COPPA FAQs, parental consent](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)

Sources define requirements and boundaries; they are not legal clearance or provider approval for Fala's specific account.
