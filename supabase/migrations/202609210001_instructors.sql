-- Cosmetic practice partner; existing rewards and conversation difficulty are unchanged.
ALTER TABLE fala.reward_profiles ADD COLUMN IF NOT EXISTS instructor text NOT NULL DEFAULT 'bananera'
  CHECK (instructor IN ('none','bananera','bateba','vesoura'));
