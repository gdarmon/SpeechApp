ALTER TABLE fala.reward_profiles ADD COLUMN IF NOT EXISTS ui_language text
  CHECK (ui_language IN ('en-US', 'he-IL'));
ALTER TABLE fala.reward_profiles ADD COLUMN IF NOT EXISTS reminder_defaults_applied boolean NOT NULL DEFAULT false;
ALTER TABLE fala.reward_profiles ALTER COLUMN reminder_enabled SET DEFAULT true;
ALTER TABLE fala.reward_profiles ALTER COLUMN reminder_minute SET DEFAULT 1020;

-- Apply the new default once to existing accounts; later opt-outs survive reruns.
UPDATE fala.reward_profiles SET reminder_minute = CASE WHEN reminder_enabled THEN reminder_minute ELSE 1020 END,
  reminder_enabled = true, reminder_defaults_applied = true WHERE NOT reminder_defaults_applied;
ALTER TABLE fala.reward_profiles ALTER COLUMN reminder_defaults_applied SET DEFAULT true;

UPDATE fala.reward_profiles p SET ui_language = (
  SELECT s.request->>'support_language' FROM fala.sessions s WHERE s.user_id=p.user_id
    AND s.request->>'support_language' IN ('en-US','he-IL') ORDER BY s.started_at DESC LIMIT 1
) WHERE ui_language IS NULL;
