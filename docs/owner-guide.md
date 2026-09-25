# Fala — owner guide and project handoff

This documentation lets someone open the project with Claude Code, GitHub Copilot or another agent and continue without reconstructing previous conversations. Project instructions, architecture, release procedures and version records live in GitHub alongside the code.

## Where to start

- [Documentation index](README.md).
- [Developer and agent handoff](agent-handoff.md): code, checks and unresolved issues.
- [Working with Claude and Copilot](agent-setup.md).
- [Release runbook](releasing.md): preparing a version and verifying the website and Google Play releases.
- [Current release: learning at your own pace in 0.14.1](releases/0.14.1.md).
- [Earlier language and reminder release: 0.14.0](releases/0.14.0.md).

All maintained documentation and agent instructions are written in English.

## What the project contains

| Component | Purpose | When it needs an update |
|---|---|---|
| Android app | Phone screens, microphone, playback, reminders and update offers | Native screen or device behavior changes require a new Android version |
| Website | Browser practice, including iPhone and desktop use | Publishing the website updates the web files |
| Server | Questions, reply validation, progress, points, settings and notifications | Server changes also reach existing clients without reinstalling |
| Database | Accounts, conversations, progress and preferences | Schema or default changes may require a separate migration |
| Google Play | Distribution of the signed app to testers | Upload a new bundle or promote an existing bundle |

Publishing the website alone does not update the Android app installed on a phone.

## Learning at your own pace in 0.14.1

The app keeps the learner at their chosen difficulty and removes the two-session promotion promise. Consistent practice across different days and situations can support an optional challenge, which the learner can choose when ready. Beginners practise fewer new words; intermediate examples are shorter, with no sentence-count quota. Repetition and help are normal parts of learning. See [the progression guide](learning-progression.md) for the rationale and limits.

The website and Internal Testing were verified on 0.14.1, build 104101. Closed Alpha accepted the same build and was in Google review at the time recorded in [the release receipt](releases/0.14.1.md). Update Android to replace the older help text.

## What changed in 0.14.0

- Hebrew or English selection throughout the interface, saved to the account. Hebrew uses a right-to-left layout; Portuguese remains left-to-right.
- Daily reminders default to enabled at 17:00 in the user's time zone. Existing accounts received the update while previously enabled custom times were preserved. Users can turn reminders off; later opt-outs are retained.
- The app requests operating-system notification permission. It cannot grant permission on the user's behalf.
- Reply examples match the question; validation rejects unjustified reuse of the same pair after the question changes.
- Normal Android playback no longer slows automatically because of a model response. Explicit slow playback remains available.
- The version remains visible, with release notes and checks.

The report of roughly five seconds waiting after Send remains a separate measurement task. That release does not claim to have measured or fixed the cause.

## Requesting another change

A development request can say:

> Read AGENTS.md and docs/agent-handoff.md. Implement the following change, check it and update the documentation. Prepare a reviewable version, but do not publish yet.

When ready to publish:

> Use fala-release and docs/releasing.md. Publish the version to the website, Internal Testing and the existing closed-testing track. Verify the results and record the version, build number and Google review state. Do not publish to Production.

If publishing to those targets is already authorized, that approval does not need to be requested at every step. If an account connection is missing or another pending Google review must be replaced, the agent should explain exactly what is missing or would be replaced.

## What happens during a release

1. Update the version everywhere and add English release notes.
2. Run checks and build the app. Apply and verify any required database change before deploying server code that depends on it.
3. Push the prepared code to GitHub. Main-branch changes trigger website deployment and cloud checks.
4. After checks pass, the workflow builds an Android bundle with the existing signing key and uploads it to Internal Testing.
5. Promote that same bundle and build number to the closed Alpha track. No rebuild is needed.
6. Verify the intended version was accepted by the website and Google Play; separately record whether Google is still reviewing it.

The version, such as **0.14.0**, appears in the app. The build number, such as **104001**, is allocated automatically for each Android upload and must increase. Never reuse a build number.

## Knowing whether an update is available

- **Website:** open [Fala](https://falachatapp.netlify.app/app/), check the displayed version and exercise the change.
- **Internal Testing:** check the successful upload receipt for the intended version and build number.
- **Closed Testing:** also check Google's review lifecycle. Acceptance into a track does not necessarily mean testers can already install it.
- **Phone:** the Google account must be eligible for the track, and the installed app must be updated. An updated browser does not prove that the phone received a new Android binary.

The 0.14.0 receipt recorded a live website, both testing tracks pointing to build 104001, and the closed release in `IN_REVIEW`. This is a dated observation, not a promise about its current state.

## Moving to another machine or coding agent

Clone GitHub and open the repository in the new tool. Claude uses `CLAUDE.md`; Copilot uses `.github/copilot-instructions.md`; both point to `AGENTS.md` and shared documentation. Skills are committed under `.claude/skills/`.

Logins and passwords do not travel through GitHub. Establish normal GitHub and service connections on a new machine. Signing and publishing credentials already live in GitHub Actions secrets; do not copy them into chat or source code.

Changing the development assistant does not change Fala's in-app AI provider. That requires a separate server configuration change.

## What to retain

Keep source, checks, design documents, agent instructions, migrations, release notes and non-secret publication receipts in GitHub. Keep passwords, tokens, private signing keys, database credentials and learner data outside the repository.

Update the relevant document after a significant change. After each release, add a record under `docs/releases/`. Documentation-only changes should not upload Android again; the release runbook explains the separate publication path.
