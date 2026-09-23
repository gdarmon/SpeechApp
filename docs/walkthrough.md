# Conversation guide persistence

The beginner guide is independent of the installed app version. Its displayed/dismissed status is saved as the account preference `walkthrough_seen` and cached on the device. A returning account restores the status from `/dashboard`. Old clients' saved practice also marks the account as experienced, so a missing local flag does not interrupt an existing learner.

The preference is monotonic: older clients omitting it, learning-data resets, language changes and app upgrades cannot clear it. Account deletion removes it with the profile. Manually replaying the guide is a separate, temporary UI request and never resets the stored status. New features must not reset the beginner guide.

Apply `supabase/migrations/202609230001_walkthrough.sql` in a transaction before deploying 0.13.5. The migration is additive and rerunnable; existing clients tolerate the additional profile property. New clients tolerate an older profile without it and keep their local flag. Failed preference syncs retry on the next dashboard load.

Android's Listen and Slower actions explicitly choose normal or slow playback, independently of a reply's suggested pace. Repeated Slower presses stay slow. The native speech engine receives rate 1.0 or 0.7; Web Audio uses the same playback rates. Actual synthesized rhythm can vary with the installed Android voice. Diagnostic reports record the selected rate (100 or 70) without the spoken text.
