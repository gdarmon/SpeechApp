-- Account preference, independent of app version. Existing clients may omit it.
ALTER TABLE fala.reward_profiles ADD COLUMN IF NOT EXISTS walkthrough_seen boolean NOT NULL DEFAULT false;
