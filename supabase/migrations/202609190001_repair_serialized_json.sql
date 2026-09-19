BEGIN;

-- Earlier Postgres.js writes serialized JSON strings a second time. Restore the
-- original objects without changing conversation IDs, ownership, or contents.
UPDATE fala.sessions SET request=(request #>> '{}')::jsonb WHERE jsonb_typeof(request)='string';
UPDATE fala.sessions SET opening=(opening #>> '{}')::jsonb WHERE jsonb_typeof(opening)='string';
UPDATE fala.sessions SET feedback=(feedback #>> '{}')::jsonb WHERE jsonb_typeof(feedback)='string';
UPDATE fala.turns SET request=(request #>> '{}')::jsonb WHERE jsonb_typeof(request)='string';
UPDATE fala.turns SET reply=(reply #>> '{}')::jsonb WHERE jsonb_typeof(reply)='string';
UPDATE fala.evidence SET correction=(correction #>> '{}')::jsonb WHERE jsonb_typeof(correction)='string';

COMMIT;
