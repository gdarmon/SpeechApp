# Android update notices

Fala 0.13.0 adds optional Google Play flexible in-app updates. The Play SDK checks availability for the current installation and account, including track eligibility. A newer server or web version alone never triggers an Android update notice.

- On app resume, check Play and recover any existing download.
- Show a Hebrew or English card only on Home or Settings when the app is idle. Conversations, recordings, onboarding and feedback are never interrupted.
- Update opens Play's consent flow. Downloading does not block practice.
- Once downloaded, Install and restart explicitly completes installation. Never restart automatically from a callback or while the app is in the background.
- Later (or canceling Play's consent flow) hides that version for 24 hours, including across restarts and sign-out. A different eligible release can be offered earlier.
- Availability failures are silent; explicit update failures stay in the optional card and never disable learning.

This is an in-app notice, not a push message to a closed app. Existing 0.12.4 installations must first install a version containing the feature through Google Play. Web clients do not use this Android update flow.

## Verification

Unit tests cover Play eligibility, downgrade/no-update cases, recovering downloads, safe screens, and per-version postponement. Build and lint verify the SDK integration. A real Play install/update test still requires two signed, eligible versions distributed by Play; a debug APK alone cannot validate that flow.

After approved distribution, install 0.13.0 via Play on a test device. Make a higher-version build available to the same account/track. Check Update/Cancel, downloading while practising, a completed download during a conversation, explicitly restarting from Home, and Later surviving an app restart. An account without access to the newer track must see no notice. For internal app sharing, use Google's documented two-build procedure.

References: [Play in-app updates](https://developer.android.com/guide/playcore/in-app-updates/kotlin-java), [testing](https://developer.android.com/guide/playcore/in-app-updates/test).
