BEGIN;

-- A durable per-account claim releases the SQL connection during generation.
-- The random claim ID fences late responses after expiry/takeover. No text or
-- credentials are stored here; a deleted account cannot be resurrected.
CREATE TABLE IF NOT EXISTS fala.generation_claims (
  user_id uuid PRIMARY KEY REFERENCES fala.users(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
ALTER TABLE fala.generation_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fala.generation_claims FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON fala.generation_claims FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

COMMIT;
