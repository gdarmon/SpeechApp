-- Reports are private to the service operator and deleted with the account/conversation.
CREATE TABLE IF NOT EXISTS fala.content_reports (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES fala.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES fala.sessions(id) ON DELETE CASCADE,
  target_key text NOT NULL,
  category text NOT NULL CHECK (category IN ('inappropriate','unsafe','inaccurate','other')),
  note text NOT NULL DEFAULT '' CHECK (length(note)<=1000),
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed')),
  UNIQUE(user_id,session_id,target_key)
);
CREATE INDEX IF NOT EXISTS content_reports_review ON fala.content_reports(status,created_at);
ALTER TABLE fala.content_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fala.content_reports FROM anon,authenticated;
