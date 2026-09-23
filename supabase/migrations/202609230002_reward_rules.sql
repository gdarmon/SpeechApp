-- Keep existing points and unlocks. Old server instances continue to write version 1;
-- the new server explicitly writes version 2. No timestamps or point rescaling needed.
ALTER TABLE fala.reward_events
  ADD COLUMN IF NOT EXISTS rules_version integer NOT NULL DEFAULT 1 CHECK (rules_version IN (1, 2));
