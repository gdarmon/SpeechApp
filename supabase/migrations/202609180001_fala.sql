BEGIN;

-- Kept outside the public/Data API schema. This is a private, single-learner app.
CREATE SCHEMA IF NOT EXISTS fala;
REVOKE ALL ON SCHEMA fala FROM PUBLIC;

CREATE TABLE IF NOT EXISTS fala.sessions (
  id uuid PRIMARY KEY,
  request_id text NOT NULL UNIQUE,
  request jsonb NOT NULL,
  kind text NOT NULL CHECK (kind IN ('conversation', 'assessment')),
  topic text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  opening jsonb NOT NULL,
  feedback jsonb,
  demo boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS fala.turns (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES fala.sessions(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  request jsonb NOT NULL,
  text text NOT NULL,
  help boolean NOT NULL,
  language text NOT NULL,
  speech_ms integer NOT NULL CHECK (speech_ms BETWEEN 0 AND 180000),
  reply jsonb NOT NULL,
  UNIQUE(session_id, request_id)
);
CREATE TABLE IF NOT EXISTS fala.evidence (
  session_id uuid NOT NULL REFERENCES fala.sessions(id) ON DELETE CASCADE,
  key text NOT NULL,
  correction jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(session_id, key)
);
-- Survives function cold starts and multiple instances. Does not contain transcripts.
CREATE TABLE IF NOT EXISTS fala.rate_limit (
  id integer PRIMARY KEY CHECK (id = 1),
  window_start timestamptz NOT NULL,
  requests integer NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_recent ON fala.sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS evidence_by_pattern ON fala.evidence(key, observed_at DESC);
CREATE INDEX IF NOT EXISTS turns_session_order ON fala.turns(session_id, id);
ALTER TABLE fala.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fala.turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE fala.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE fala.rate_limit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA fala FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA fala FROM PUBLIC;

-- Supabase roles already exist there; conditional handling also supports local PostgreSQL.
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA fala FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA fala FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA fala FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

COMMIT;
