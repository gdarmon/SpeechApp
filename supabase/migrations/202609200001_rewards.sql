-- Account-owned rewards; no conversation text is copied into the points ledger.
CREATE TABLE IF NOT EXISTS fala.reward_profiles (
  user_id uuid PRIMARY KEY REFERENCES fala.users(id) ON DELETE CASCADE,
  nickname text NOT NULL DEFAULT 'Learner',
  timezone text NOT NULL DEFAULT 'UTC',
  timezone_confirmed boolean NOT NULL DEFAULT false,
  zone_changed_at timestamptz,
  theme text NOT NULL DEFAULT 'classic',
  skin text NOT NULL DEFAULT 'classic',
  appearance text NOT NULL DEFAULT 'system',
  reduce_motion boolean NOT NULL DEFAULT false,
  reminder_enabled boolean NOT NULL DEFAULT false,
  reminder_minute integer NOT NULL DEFAULT 1020 CHECK (reminder_minute BETWEEN 0 AND 1439)
);
CREATE TABLE IF NOT EXISTS fala.reward_events (
  user_id uuid NOT NULL REFERENCES fala.users(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('reply','daily','complete','mission')),
  xp integer NOT NULL CHECK(xp BETWEEN 0 AND 20),
  local_date date NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid,
  lesson text,
  spoken boolean NOT NULL DEFAULT false,
  PRIMARY KEY(user_id,event_key)
);
CREATE INDEX IF NOT EXISTS reward_events_day ON fala.reward_events(user_id,local_date);
CREATE INDEX IF NOT EXISTS reward_events_session ON fala.reward_events(user_id,session_id,kind);
CREATE TABLE IF NOT EXISTS fala.friend_circles (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES fala.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  timezone text NOT NULL,
  invite_code text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fala.circle_members (
  user_id uuid PRIMARY KEY REFERENCES fala.users(id) ON DELETE CASCADE,
  circle_id uuid NOT NULL REFERENCES fala.friend_circles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS circle_members_circle ON fala.circle_members(circle_id);
CREATE TABLE IF NOT EXISTS fala.push_subscriptions (
  endpoint text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES fala.users(id) ON DELETE CASCADE,
  subscription jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON fala.push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS fala.reminder_deliveries (
  user_id uuid NOT NULL REFERENCES fala.users(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,local_date)
);
ALTER TABLE fala.reward_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fala.reward_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fala.friend_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fala.circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE fala.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fala.reminder_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fala.reward_profiles, fala.reward_events, fala.friend_circles, fala.circle_members,
  fala.push_subscriptions, fala.reminder_deliveries FROM anon, authenticated;
