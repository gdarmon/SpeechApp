import { randomUUID } from "node:crypto";
import type { Database, Executor, Parameter } from "./database.js";
import { AppError, type Session, type Start, type TurnInput, type Reply, type Feedback, type Correction,
  type Assessment, type LearnerContext, type Memory, type Turn } from "./models.js";
import type { Timing } from "./timing.js";

const due = (date: string) => new Date(new Date(date).getTime() + 86400000).toISOString();

// A single statement gives a consistent snapshot and avoids many cross-region DB round trips.
const contextSql = `
SELECT
  (SELECT to_jsonb(s) FROM fala.sessions s WHERE id = $1::uuid) AS session,
  COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM fala.turns t WHERE session_id=$1::uuid), '[]'::jsonb) AS turns,
  (SELECT feedback->'assessment' FROM fala.sessions WHERE NOT demo AND feedback->'assessment' <> 'null'::jsonb
    ORDER BY ended_at DESC LIMIT 1) AS assessment,
  COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM (
    SELECT DISTINCT ON (key) correction, observed_at, count(*) OVER (PARTITION BY key)::int AS occurrences
    FROM fala.evidence ORDER BY key, observed_at DESC
  ) m), '[]'::jsonb) AS memory,
  COALESCE((SELECT jsonb_agg(to_jsonb(h)) FROM (
    SELECT t.reply->>'practice_phrase' AS natural, count(DISTINCT t.session_id)::int AS occurrences,
      max(s.started_at) AS last_seen, (array_agg(s.topic ORDER BY s.started_at DESC))[1] AS topic
    FROM fala.turns t JOIN fala.sessions s ON s.id=t.session_id
    WHERE t.help AND NOT s.demo AND COALESCE(t.reply->>'practice_phrase','') <> ''
    GROUP BY t.reply->>'practice_phrase'
  ) h), '[]'::jsonb) AS help_patterns,
  COALESCE((SELECT jsonb_agg(topic) FROM (SELECT topic FROM fala.sessions WHERE NOT demo ORDER BY started_at DESC LIMIT 5) r), '[]'::jsonb) AS recent_topics
`;

type SnapshotRow = {
  session: Omit<Session, "turns"> | null; turns: Turn[]; assessment: Assessment | null;
  memory: { correction: Correction; observed_at: string; occurrences: number }[];
  help_patterns: { natural: string; last_seen: string; occurrences: number; topic: string }[];
  recent_topics: string[];
};

export class Store {
  constructor(private db: Database, private timing: Timing, private executor: Executor = db) {}

  query<T = Record<string, unknown>>(sql: string, values: Parameter[] = []) {
    return this.timing.measure("db", () => this.executor.query<T>(sql, values));
  }

  async mutate<T>(action: (store: Store) => Promise<T>): Promise<T> {
    // Transaction-scoped locks work with Supabase's transaction pooler; process mutexes do not.
    // One learner, one mutating request. Never hold a lock between spoken turns.
    return this.db.transaction(async tx => {
      const store = new Store(this.db, this.timing, tx);
      const [row] = await store.query<{ locked: boolean }>(`SELECT pg_try_advisory_xact_lock(7310491701::bigint) AS locked,
        set_config('statement_timeout','8000',true), set_config('idle_in_transaction_session_timeout','45000',true)`);
      if (!row.locked) throw new AppError(409, "Another conversation request is still processing. Retry shortly.");
      return action(store);
    });
  }

  async budget() {
    const [row] = await this.query<{ requests: number }>(`
      INSERT INTO fala.rate_limit VALUES (1,now(),1)
      ON CONFLICT(id) DO UPDATE SET
        requests = CASE WHEN fala.rate_limit.window_start < now()-interval '1 minute' THEN 1 ELSE fala.rate_limit.requests+1 END,
        window_start = CASE WHEN fala.rate_limit.window_start < now()-interval '1 minute' THEN now() ELSE fala.rate_limit.window_start END
      RETURNING requests`);
    if (row.requests > 30) throw new AppError(429, "Too many requests. Wait a minute and try again.");
  }

  async snapshot(id: string | null = null): Promise<{ session: Session | null; learner: LearnerContext }> {
    const [row] = await this.query<SnapshotRow>(contextSql, [id]);
    const memory: Memory[] = row.memory.map(m => ({ ...m.correction, occurrences: m.occurrences,
      last_seen: m.observed_at, due_at: due(m.observed_at) }));
    const help_patterns: Memory[] = row.help_patterns.map(h => ({ ...h, category: "retrieval", due_at: due(h.last_seen) }));
    return { session: row.session ? { ...row.session, turns: row.turns } : null,
      learner: { assessment: row.assessment, memory, help_patterns, recent_topics: row.recent_topics } };
  }

  async session(id: string): Promise<Session> {
    const [row] = await this.query<{ session: Omit<Session, "turns">; turns: Turn[] }>(`
      SELECT to_jsonb(s) AS session,
        COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM fala.turns t WHERE session_id=s.id),'[]'::jsonb) AS turns
      FROM fala.sessions s WHERE id=$1::uuid`, [id]);
    if (!row) throw new AppError(404, "Conversation not found.");
    return { ...row.session, turns: row.turns };
  }

  async started(requestId: string) {
    const [row] = await this.query<{ id: string }>("SELECT id FROM fala.sessions WHERE request_id=$1", [requestId]);
    return row ? this.session(row.id) : null;
  }

  async create(input: Start, opening: Reply, demo: boolean): Promise<Session> {
    const id = randomUUID();
    const [row] = await this.query<Omit<Session, "turns">>(`
      INSERT INTO fala.sessions(id,request_id,request,kind,topic,opening,demo)
      VALUES($1::uuid,$2,$3::jsonb,$4,$5,$6::jsonb,$7) RETURNING *`,
      [id, input.request_id, JSON.stringify(input), input.kind, opening.topic || input.topic, JSON.stringify(opening), demo]);
    return { ...row, started_at: new Date(row.started_at).toISOString(), turns: [] };
  }

  async append(id: string, input: TurnInput, reply: Reply) {
    await this.query(`INSERT INTO fala.turns(session_id,request_id,request,text,help,language,speech_ms,reply)
      VALUES($1::uuid,$2,$3::jsonb,$4,$5,$6,$7,$8::jsonb)`,
      [id, input.request_id, JSON.stringify(input), input.text, input.help, input.language, input.speech_ms, JSON.stringify(reply)]);
  }

  async finish(id: string, feedback: Feedback, demo: boolean) {
    // Both statements run in the surrounding mutation transaction, so failure cannot save half a report.
    await this.query("UPDATE fala.sessions SET ended_at=now(),feedback=$2::jsonb WHERE id=$1::uuid", [id, JSON.stringify(feedback)]);
    if (!demo && feedback.corrections.length) {
      await this.query(`INSERT INTO fala.evidence(session_id,key,correction)
        SELECT $1::uuid, item->>'key',item FROM jsonb_array_elements($2::jsonb) AS item`, [id, JSON.stringify(feedback.corrections)]);
    }
  }

  async history() {
    return this.query(`SELECT id,kind,topic,started_at,ended_at,demo::int,
      (SELECT count(*)::int FROM fala.turns WHERE session_id=s.id) AS turn_count
      FROM fala.sessions s ORDER BY started_at DESC LIMIT 100`);
  }

  async progress() {
    const { learner } = await this.snapshot();
    const [stats] = await this.query(`SELECT
      (SELECT count(*)::int FROM fala.sessions s WHERE NOT demo AND ended_at IS NOT NULL
        AND EXISTS(SELECT 1 FROM fala.turns t WHERE t.session_id=s.id AND NOT t.help)) AS conversations,
      (SELECT COALESCE(sum(t.speech_ms),0)::float8 FROM fala.turns t JOIN fala.sessions s ON s.id=t.session_id WHERE NOT s.demo AND NOT t.help) AS speech_ms,
      (SELECT count(*)::int FROM fala.turns t JOIN fala.sessions s ON s.id=t.session_id WHERE NOT s.demo) AS learner_turns,
      (SELECT count(*)::int FROM fala.turns t JOIN fala.sessions s ON s.id=t.session_id WHERE NOT s.demo AND t.help) AS help_requests,
      COALESCE((SELECT jsonb_agg(DISTINCT topic) FROM fala.sessions WHERE NOT demo AND ended_at IS NOT NULL),'[]'::jsonb) AS topics`);
    return { ...stats, assessment: learner.assessment, memory: learner.memory, help_patterns: learner.help_patterns };
  }

  async delete(id?: string) {
    if (id) await this.query("DELETE FROM fala.sessions WHERE id=$1::uuid", [id]);
    else await this.query("DELETE FROM fala.sessions");
  }

  async ping() { await this.query("SELECT 1 AS ready FROM fala.sessions LIMIT 1"); }
}

export function publicSession(session: Session) {
  const { request: _request, ...rest } = session;
  return { ...rest, demo: Number(session.demo), turns: session.turns.map(t => {
    const { request: _request, ...turn } = t as Turn & { request?: TurnInput };
    return { ...turn, help: Number(t.help) };
  }) };
}
