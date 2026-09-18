BEGIN;

CREATE TABLE IF NOT EXISTS fala.users (
  id uuid PRIMARY KEY,
  google_subject text UNIQUE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Preserve earlier single-learner data in a separate operator account. Never assign it to a new signup.
INSERT INTO fala.users(id,email) VALUES('00000000-0000-4000-8000-000000000001','legacy-operator') ON CONFLICT DO NOTHING;
ALTER TABLE fala.sessions ADD COLUMN IF NOT EXISTS user_id uuid NOT NULL
  DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES fala.users(id) ON DELETE CASCADE;
ALTER TABLE fala.sessions ALTER COLUMN user_id DROP DEFAULT;
ALTER TABLE fala.sessions DROP CONSTRAINT IF EXISTS sessions_request_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS sessions_user_request ON fala.sessions(user_id,request_id);
CREATE INDEX IF NOT EXISTS sessions_user_recent ON fala.sessions(user_id,started_at DESC);
CREATE TABLE IF NOT EXISTS fala.login_challenges (
  id uuid PRIMARY KEY,
  nonce_hash text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS fala.device_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES fala.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS device_sessions_user ON fala.device_sessions(user_id);
CREATE TABLE IF NOT EXISTS fala.auth_rate_limits (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  requests integer NOT NULL
);
CREATE TABLE IF NOT EXISTS fala.usage_limits (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  requests integer NOT NULL
);
CREATE INDEX IF NOT EXISTS login_challenges_expiry ON fala.login_challenges(expires_at);
CREATE INDEX IF NOT EXISTS device_sessions_expiry ON fala.device_sessions(expires_at);
ALTER TABLE fala.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE fala.login_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE fala.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fala.auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE fala.usage_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA fala FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA fala FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
COMMIT;
