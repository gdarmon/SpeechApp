# Practice rewards in Fala

Web and native Android share account-owned rewards. New practice after this update earns points; older conversations are not retroactively scored. Cosmetic rewards do not change the learner's speaking level or capoeira curriculum.

## Earning points

- 1 XP for each eligible Portuguese reply, plus 1 XP when it is spoken (speech source and positive recorded duration).
- At most 20 XP per ten-answer lesson, including a lesson resumed on another day.
- At most 40 XP per local day. Further practice still counts toward milestones and streaks, but earns no additional XP that day.
- No additional daily, completion or weekly XP bonuses. Those achievements remain visible milestones.

A complete typed lesson earns 10 XP; a complete spoken lesson earns 20 XP; a mixture earns 10–20 XP before the daily cap. Partial practice earns points for its saved replies. Mistakes and answer ideas do not reduce XP. These are participation points, not an accuracy, pronunciation or proficiency grade. Demo practice and help requests do not count. Only the first ten eligible replies in a conversation qualify. The server records unique awards in the existing per-learner transaction, so retries cannot award points twice. Completion/mission events remain in the ledger at zero XP.

A date with three replies qualifies for the streak. One missed day per week may bridge a streak and is marked ◇, without XP. Time zone changes are limited to once per 20 hours after initial setup.

## Rewards and friends

Themes: Classic (free), Copacabana (2,000 XP), Roda (5,000), Salvador sunset (10,000). Microphone skins: Classic (free), Ocean wave (2,000), Roda rhythm (5,000). Previews do not equip locked rewards. All choices support device/light/dark appearance. Celebration animation respects system and in-app reduced motion.

A learner can join one private circle, with up to 12 members. Invitations are random, replaceable bearer links. Members see nicknames, weekly points and a shared goal of 12 conversations. The circle's creation time zone defines Monday resets. All completed ten-answer conversations count toward the shared goal, including those completed after the daily XP cap. Points earned earlier in the same week are included on joining. Nothing posts to a public leaderboard. The creator can close the group; all learners keep personal rewards. Deleting a single conversation retains aggregate rewards; clearing learning data resets rewards; account deletion cascades through every reward table.

## Capoeira partners (0.12.0)

The original CapoeiraMath instructor art is available as optional character skins: Bananera (free, selected initially), Bateba (2,000 lifetime XP), and Vesoura (5,000). Full-character previews live in Rewards. A compact portrait appears in capoeira lessons only; everyday conversations keep the simple Fala label. A brief end-of-conversation celebration announces newly earned partners without automatically changing the selection. Fala only removes the character, including from future lesson cards. Unlock announcements may still appear when a new reward is earned.

Selections belong to the signed-in account and sync on refresh between web and Android. These are cosmetic skins sharing Fala’s existing voice, prompts, difficulty and feedback, without impersonating an instructor. The server validates XP before saving a selection; older clients updating unrelated settings preserve it. Learning reset clears earned unlocks and restores Bananera, or keeps Fala only if already selected. Conversation deletion retains rewards.

Apply `supabase/migrations/202609210001_instructors.sql` in a transaction before deploying 0.12.0. It adds one defaulted column to the existing reward profile and can be rerun. No AI-provider configuration or additional AI calls are needed for skins.

## 0.13.7 transition

Apply `supabase/migrations/202609230002_reward_rules.sql` before the new server. This additive, rerunnable migration marks existing reward events with rules version 1, the default also used by any old server instances still finishing requests. New server awards explicitly use version 2.

Lifetime points are not rescaled. Looks already earned under the former thresholds stay unlocked and can be selected again. Only version 1 points are compared against those retired thresholds; new points cannot unlock another look at an old price. Session deletion retains the ledger; a deliberate learning reset clears both points and unlocks as before. A legacy lesson that already earned 20 or more points earns no additional points when resumed.

The first earned cosmetics require at least 100 full spoken lessons from zero (2,000 XP), the second tier at least 250 (5,000 XP). The 40-XP daily cap means at least 50 and 125 practice days respectively. Defaults remain free. The server supplies all unlock thresholds to both clients. Existing clients receive new points and thresholds on their next refresh without reinstalling; 0.13.7 also updates the explanation inside Android and the website.

## Deployment and notifications

Apply `supabase/migrations/202609200001_rewards.sql` once to the existing Fala database before deploying this version. It is additive and rerunnable. Apply it in a transaction. Tables have RLS and deny browser database roles; only the authenticated Fala server handles them.

Generate one Web Push key pair with `web-push.generateVAPIDKeys()` and save `FALA_VAPID_PUBLIC_KEY` and `FALA_VAPID_PRIVATE_KEY` as Netlify environment variables available to Functions. On the Personal plan, use all available scopes (a secret uses Builds, Functions and Runtime), and choose an explicit Production context for the private key. Keep the private key secret and stable; rotating it requires reconnecting browsers. Redeploy after setting environment variables. Do not commit either credentials or subscriptions.

The `reminders` scheduled function runs every 15 minutes on production. Notifications default to off and 17:00 in the learner's time zone. Web users enable account reminders and connect their browser once. iPhone/iPad users must open the app installed on their Home Screen and grant notification permission (supported on iOS/iPadOS 16.4+). Native Android uses WorkManager and notification permission; the OS may delay work to save battery. Native and web reminders claim the same account/date record so only one device is notified that day; web chooses the most recently connected browser. A reminder is eligible only when there is no saved Portuguese reply that local day, even if the three-reply daily goal is unfinished. The server rechecks this after selecting a candidate and uses reply timestamps in the current time zone, including practice from other devices. Delivery is limited to one hour after the chosen time. Messages use the phone’s help language, or the latest conversation’s help language for web push (English if none is available). Already queued messages cannot be recalled.

Scheduled batches currently handle up to 20 eligible learners per run, four sends concurrently with four-second timeouts. For larger audiences, replace this bounded scheduler with a queue before growing beyond its capacity. Delivery is best effort, not an exact-time alarm. Expired web subscriptions are removed. No AI request is needed to send a reminder.

## Verification

`npm test` covers awards, caps, retries, unlock enforcement, time zones, private groups, failed invitation limits and reminder deduplication. `npm run test:web` checks conversation controls, themes, circle forms, preferences, responsive layouts, offline files and sign-out cleanup. Android unit tests cover reminder scheduling across Israel's clock change; Android lint and builds check platform integration. Real-device permission prompts and background delivery still need device testing.
