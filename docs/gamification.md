# Practice rewards in Fala

Web and native Android share account-owned rewards. New practice after this update earns points; older conversations are not retroactively scored. Cosmetic rewards do not change the learner's speaking level or capoeira curriculum.

## Earning points

- 2 XP for each of the first 20 eligible Portuguese replies per local day.
- 10 XP once a day for reaching three replies: the daily goal.
- 20 XP for each of the first two ten-answer conversations per day.
- 10 XP once per Monday-based week for completing three distinct capoeira scenarios.

A first complete conversation earns 50 XP. The daily base maximum is 90 XP, plus the weekly mission when earned. Hints, typed replies and mistakes count; demo practice and help requests do not. Only the first ten conversation replies qualify. The server records awards with unique event keys inside the existing per-learner transaction; replaying a request cannot award points twice. A date with three replies qualifies for the streak. One missed day per week may bridge a streak and is marked ◇, without XP. Time zone changes are limited to once per 20 hours after initial setup.

## Rewards and friends

Themes: Classic (free), Copacabana (100 XP), Roda (300), Salvador sunset (1,000). Microphone skins: Classic (free), Ocean wave (150), Roda rhythm (600). Previews do not equip locked rewards. All choices support device/light/dark appearance. Celebration animation respects system and in-app reduced motion.

A learner can join one private circle, with up to 12 members. Invitations are random, replaceable bearer links. Members see nicknames, weekly points and a shared goal of 12 conversations. The circle's creation time zone defines Monday resets. Only conversations earning a completion bonus count toward the shared goal. Points earned earlier in the same week are included on joining. Nothing posts to a public leaderboard. The creator can close the group; all learners keep personal rewards. Deleting a single conversation retains aggregate rewards; clearing learning data resets rewards; account deletion cascades through every reward table.

## Capoeira partners (0.12.0)

The original CapoeiraMath instructor art is available as optional character skins: Bananera (free, selected initially), Bateba (200 lifetime XP), and Vesoura (500). Full-character previews live in Rewards. A compact portrait appears in capoeira lessons only; everyday conversations keep the simple Fala label. A brief end-of-conversation celebration announces newly earned partners without automatically changing the selection. Fala only removes the character, including from future lesson cards. Unlock announcements may still appear when a new reward is earned.

Selections belong to the signed-in account and sync on refresh between web and Android. These are cosmetic skins sharing Fala’s existing voice, prompts, difficulty and feedback, without impersonating an instructor. The server validates XP before saving a selection; older clients updating unrelated settings preserve it. Learning reset clears earned unlocks and restores Bananera, or keeps Fala only if already selected. Conversation deletion retains rewards.

Apply `supabase/migrations/202609210001_instructors.sql` in a transaction before deploying 0.12.0. It adds one defaulted column to the existing reward profile and can be rerun. No AI-provider configuration or additional AI calls are needed for skins.

## Deployment and notifications

Apply `supabase/migrations/202609200001_rewards.sql` once to the existing Fala database before deploying this version. It is additive and rerunnable. Apply it in a transaction. Tables have RLS and deny browser database roles; only the authenticated Fala server handles them.

Generate one Web Push key pair with `web-push.generateVAPIDKeys()` and save `FALA_VAPID_PUBLIC_KEY` and `FALA_VAPID_PRIVATE_KEY` as Netlify environment variables available to Functions. On the Personal plan, use all available scopes (a secret uses Builds, Functions and Runtime), and choose an explicit Production context for the private key. Keep the private key secret and stable; rotating it requires reconnecting browsers. Redeploy after setting environment variables. Do not commit either credentials or subscriptions.

The `reminders` scheduled function runs every 15 minutes on production. Notifications default to off and 17:00 in the learner's time zone. Web users enable account reminders and connect their browser once. iPhone/iPad users must open the app installed on their Home Screen and grant notification permission (supported on iOS/iPadOS 16.4+). Native Android uses WorkManager and notification permission; the OS may delay work to save battery. Native and web reminders claim the same account/date record so only one device is notified that day; web chooses the most recently connected browser. An unfinished daily goal and a reminder window of one hour are required. Already queued messages cannot be recalled.

Scheduled batches currently handle up to 20 eligible learners per run, four sends concurrently with four-second timeouts. For larger audiences, replace this bounded scheduler with a queue before growing beyond its capacity. Delivery is best effort, not an exact-time alarm. Expired web subscriptions are removed. No AI request is needed to send a reminder.

## Verification

`npm test` covers awards, caps, retries, unlock enforcement, time zones, private groups, failed invitation limits and reminder deduplication. `npm run test:web` checks conversation controls, themes, circle forms, preferences, responsive layouts, offline files and sign-out cleanup. Android unit tests cover reminder scheduling across Israel's clock change; Android lint and builds check platform integration. Real-device permission prompts and background delivery still need device testing.
