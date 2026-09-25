import { randomUUID } from "node:crypto";
import type { Database, Executor, Parameter } from "./database.js";
import { AppError, PRACTICE_TURNS, type Session, type Start, type TurnInput, type Reply, type Feedback, type Correction,
  type Assessment, type LearnerContext, type Memory, type Turn } from "./models.js";
import type { Timing } from "./timing.js";
import { practiceLevel, practiceProgress, type PracticeEvidence } from "./learning.js";
import { compactFeedback, vocabularyForms } from "./vocabulary.js";
import type { LessonChoice, LessonHistory } from "./capoeira.js";
import { Rewards } from './rewards.js';

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
  COALESCE((SELECT jsonb_agg(topic) FROM (SELECT topic FROM fala.sessions WHERE NOT demo ORDER BY started_at DESC LIMIT 5) r), '[]'::jsonb) AS recent_topics,
  COALESCE((SELECT jsonb_agg(text) FROM (SELECT opening->>'text' AS text FROM fala.sessions WHERE NOT demo ORDER BY started_at DESC LIMIT 5) r), '[]'::jsonb) AS recent_openings,
  COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM (
    SELECT request->'resolved_lesson'->>'id' AS id, count(*)::int AS visits, max(started_at) AS last_used
    FROM fala.sessions WHERE NOT demo AND request->'resolved_lesson'->>'id' IS NOT NULL
    GROUP BY request->'resolved_lesson'->>'id'
  ) l), '[]'::jsonb) AS lessons,
  COALESCE((SELECT (request->>'resolved_level')::int FROM fala.sessions WHERE NOT demo
    ORDER BY started_at DESC, id DESC LIMIT 1), 1) AS practice_level,
  COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM (
    SELECT (request->>'resolved_level')::int AS level, ended_at,
      COALESCE(request->'resolved_lesson'->>'id', lower(trim(topic))) AS context,
      COALESCE(feedback->'practice_result'->>'ready'='true', false) AS ready
    FROM fala.sessions WHERE NOT demo AND ended_at IS NOT NULL
      AND request->>'resolved_level'=(SELECT request->>'resolved_level' FROM fala.sessions WHERE NOT demo
        ORDER BY started_at DESC, id DESC LIMIT 1)
    ORDER BY ended_at DESC, id DESC LIMIT 60
  ) p), '[]'::jsonb) AS practice_results
`;

type SnapshotRow = {
  session: Omit<Session, "turns"> | null; turns: Turn[]; assessment: Assessment | null;
  memory: { correction: Correction; observed_at: string; occurrences: number }[];
  help_patterns: { natural: string; last_seen: string; occurrences: number; topic: string }[];
  recent_topics: string[];
  recent_openings: string[]; lessons: LessonHistory[];
  practice_level: number; practice_results: PracticeEvidence[];
};

const savedTurn = (turn: Turn): Turn => ({ ...turn,
  source: turn.request?.source ?? turn.source ?? "speech",
  assisted: turn.request?.assisted ?? turn.assisted ?? false,
  ideas_hidden: turn.request?.ideas_hidden ?? turn.ideas_hidden,
});

export class Store {
  constructor(private db: Database, private timing: Timing, private userId: string,
    private dailyUserLimit = 200, private dailyAppLimit = 2000, private executor: Executor = db) {}

  // Every learner read uses these scoped relations, including aggregate memory and AI context.
  private read<T = Record<string, unknown>>(sql: string, values: Parameter[] = []) {
    const scoped = sql.replaceAll("fala.sessions", "owned_sessions").replaceAll("fala.turns", "owned_turns").replaceAll("fala.evidence", "owned_evidence");
    return this.query<T>(`WITH owned_sessions AS (SELECT * FROM fala.sessions WHERE user_id=$${values.length + 1}::uuid),
      owned_turns AS (SELECT t.* FROM fala.turns t JOIN owned_sessions s ON s.id=t.session_id),
      owned_evidence AS (SELECT e.* FROM fala.evidence e JOIN owned_sessions s ON s.id=e.session_id)
      ${scoped}`, [...values, this.userId]);
  }

  query<T = Record<string, unknown>>(sql: string, values: Parameter[] = []) {
    return this.timing.measure("db", () => this.executor.query<T>(sql, values));
  }

  async mutate<T>(action: (store: Store) => Promise<T>): Promise<T> {
    // Transaction-scoped locks work with Supabase's transaction pooler; process mutexes do not.
    // One learner, one mutating request. Never hold a lock between spoken turns.
    return this.db.transaction(async tx => {
      const store = new Store(this.db, this.timing, this.userId, this.dailyUserLimit, this.dailyAppLimit, tx);
      const [row] = await store.query<{ locked: boolean }>(`SELECT pg_try_advisory_xact_lock(hashtextextended($1,7310491701)) AS locked,
        set_config('statement_timeout','8000',true), set_config('idle_in_transaction_session_timeout','45000',true)`, [this.userId]);
      if (!row.locked) throw new AppError(409, "Another conversation request is still processing. Retry shortly.");
      const exists = await store.query("SELECT id FROM fala.users WHERE id=$1::uuid", [this.userId]);
      if (!exists.length) throw new AppError(401, "Please sign in to Fala again.");
      return action(store);
    });
  }

  async budget() {
    const rows = await this.query<{ bucket: string; requests: number }>(`
      WITH cleanup AS (DELETE FROM fala.usage_limits WHERE window_start < now()-interval '2 days' AND bucket NOT IN($1,$2,$3))
      INSERT INTO fala.usage_limits(bucket,window_start,requests) VALUES($1,now(),1),($2,now(),1),($3,now(),1)
      ON CONFLICT(bucket) DO UPDATE SET
        requests=CASE WHEN fala.usage_limits.window_start < now()-CASE WHEN EXCLUDED.bucket=$1 THEN interval '1 minute' ELSE interval '1 day' END
          THEN 1 ELSE fala.usage_limits.requests+1 END,
        window_start=CASE WHEN fala.usage_limits.window_start < now()-CASE WHEN EXCLUDED.bucket=$1 THEN interval '1 minute' ELSE interval '1 day' END
          THEN now() ELSE fala.usage_limits.window_start END
      RETURNING bucket,requests`, [`minute:${this.userId}`, `day:${this.userId}`, "day:app"]);
    for (const row of rows) {
      const limit = row.bucket.startsWith("minute:") ? 30 : row.bucket === "day:app" ? this.dailyAppLimit : this.dailyUserLimit;
      if (row.requests > limit) throw new AppError(429, row.bucket.startsWith("minute:")
        ? "Too many requests. Wait a minute and try again." : "Today's conversation allowance has been used. Please try again tomorrow.");
    }
  }

  async snapshot(id: string | null = null): Promise<{ session: Session | null; learner: LearnerContext }> {
    const [row] = await this.read<SnapshotRow>(contextSql, [id]);
    const memory: Memory[] = row.memory.map(m => ({ ...m.correction, occurrences: m.occurrences,
      last_seen: m.observed_at, due_at: due(m.observed_at) }));
    const help_patterns: Memory[] = row.help_patterns.map(h => ({ ...h, category: "retrieval", due_at: due(h.last_seen) }));
    return { session: row.session ? { ...row.session, turns: row.turns.map(savedTurn) } : null,
      learner: { assessment: row.assessment, memory, help_patterns, recent_topics: row.recent_topics, recent_openings: row.recent_openings,
        lessons: row.lessons, practice: practiceProgress(row.practice_results, row.practice_level) } };
  }

  async session(id: string): Promise<Session> {
    const [row] = await this.read<{ session: Omit<Session, "turns">; turns: Turn[] }>(`
      SELECT to_jsonb(s) AS session,
        COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM fala.turns t WHERE session_id=s.id),'[]'::jsonb) AS turns
      FROM fala.sessions s WHERE id=$1::uuid`, [id]);
    if (!row) throw new AppError(404, "Conversation not found.");
    return { ...row.session, turns: row.turns.map(savedTurn) };
  }

  async started(requestId: string) {
    const [row] = await this.read<{ id: string }>("SELECT id FROM fala.sessions WHERE request_id=$1", [requestId]);
    return row ? this.session(row.id) : null;
  }

  async create(input: Start, opening: Reply, demo: boolean, level = 1, lesson?: LessonChoice): Promise<Session> {
    const id = randomUUID();
    // Bind serialized JSON as text first: Postgres.js JSON parameters would encode the string again.
    const [row] = await this.query<Omit<Session, "turns">>(`
      INSERT INTO fala.sessions(id,request_id,request,kind,topic,opening,demo,user_id)
      VALUES($1::uuid,$2,$3::text::jsonb,$4,$5,$6::text::jsonb,$7,$8::uuid) RETURNING *`,
      [id, input.request_id, JSON.stringify({ ...input, resolved_level: level, ...(lesson ? { resolved_lesson: lesson } : {}) }), input.kind, opening.topic || input.topic, JSON.stringify(opening), demo, this.userId]);
    return { ...row, started_at: new Date(row.started_at).toISOString(), turns: [] };
  }

  async append(id: string, input: TurnInput, reply: Reply) {
    await this.query(`INSERT INTO fala.turns(session_id,request_id,request,text,help,language,speech_ms,reply)
      SELECT $1::uuid,$2,$3::text::jsonb,$4,$5,$6,$7,$8::text::jsonb FROM fala.sessions WHERE id=$1::uuid AND user_id=$9::uuid`,
      [id, input.request_id, JSON.stringify(input), input.text, input.help, input.language, input.speech_ms, JSON.stringify(reply), this.userId]);
    await new Rewards(this, this.userId).recordReply(id, input.request_id);
  }

  async finish(id: string, feedback: Feedback, demo: boolean) {
    // Both statements run in the surrounding mutation transaction, so failure cannot save half a report.
    await this.query("UPDATE fala.sessions SET ended_at=now(),feedback=$2::text::jsonb WHERE id=$1::uuid AND user_id=$3::uuid", [id, JSON.stringify(feedback), this.userId]);
    if (!demo && feedback.corrections.length) {
      await this.query(`INSERT INTO fala.evidence(session_id,key,correction)
        SELECT $1::uuid, item->>'key',item FROM jsonb_array_elements($2::text::jsonb) AS item WHERE EXISTS(SELECT 1 FROM fala.sessions WHERE id=$1::uuid AND user_id=$3::uuid)`, [id, JSON.stringify(feedback.corrections), this.userId]);
    }
  }

  async history() {
    return this.read(`SELECT id,kind,topic,started_at,ended_at,demo::int,
      (SELECT count(*)::int FROM fala.turns WHERE session_id=s.id) AS turn_count
      FROM fala.sessions s ORDER BY started_at DESC LIMIT 100`);
  }

  async progress() {
    const { learner } = await this.snapshot();
    const [stats] = await this.read(`SELECT
      (SELECT count(*)::int FROM fala.sessions s WHERE NOT demo AND ended_at IS NOT NULL
        AND EXISTS(SELECT 1 FROM fala.turns t WHERE t.session_id=s.id AND NOT t.help)) AS conversations,
      (SELECT COALESCE(sum(t.speech_ms),0)::float8 FROM fala.turns t JOIN fala.sessions s ON s.id=t.session_id WHERE NOT s.demo AND NOT t.help) AS speech_ms,
      (SELECT count(*)::int FROM fala.turns t JOIN fala.sessions s ON s.id=t.session_id WHERE NOT s.demo AND NOT t.help
        AND COALESCE(t.request->>'source','speech')='speech') AS learner_turns,
      (SELECT count(*)::int FROM fala.turns t JOIN fala.sessions s ON s.id=t.session_id WHERE NOT s.demo AND NOT t.help
        AND t.request->>'source'='typed') AS typed_turns,
      (SELECT count(*)::int FROM fala.turns t JOIN fala.sessions s ON s.id=t.session_id WHERE NOT s.demo AND t.help) AS help_requests,
      COALESCE((SELECT jsonb_agg(DISTINCT topic) FROM fala.sessions WHERE NOT demo AND ended_at IS NOT NULL),'[]'::jsonb) AS topics`);
    return { ...stats, assessment: learner.assessment, memory: learner.memory, help_patterns: learner.help_patterns, practice: learner.practice };
  }

  async previouslySeenWords(sessionId: string, words: string[]): Promise<Set<string>> {
    if (!words.length) return new Set();
    const rows = await this.read<{ word: string }>(`
      SELECT DISTINCT candidate->>'word' AS word
      FROM jsonb_array_elements($2::text::jsonb) candidate
      WHERE EXISTS (SELECT 1 FROM (
        SELECT opening->>'text' AS text FROM fala.sessions WHERE NOT demo AND id<>$1::uuid
        UNION ALL SELECT t.text FROM fala.turns t JOIN fala.sessions s ON s.id=t.session_id
          WHERE NOT s.demo AND NOT t.help AND s.id<>$1::uuid
        UNION ALL SELECT t.reply->>'text' FROM fala.turns t JOIN fala.sessions s ON s.id=t.session_id
          WHERE NOT s.demo AND s.id<>$1::uuid
        UNION ALL SELECT t.reply->'turn_feedback'->>'natural' FROM fala.turns t JOIN fala.sessions s ON s.id=t.session_id
          WHERE NOT s.demo AND s.id<>$1::uuid AND t.reply->'turn_feedback'->>'kind'='correction'
      ) exposure, LATERAL jsonb_array_elements_text(candidate->'forms') form
      WHERE position(' ' || form || ' ' IN ' ' || regexp_replace(
        translate(lower(exposure.text), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
        '[^a-z]+', ' ', 'g') || ' ') > 0)`, [sessionId, JSON.stringify(words.map(word => ({ word, forms: vocabularyForms(word) })))]);
    return new Set(rows.map(row => row.word));
  }

  async delete(id?: string) {
    if (id) {
      const rows = await this.query("DELETE FROM fala.sessions WHERE id=$1::uuid AND user_id=$2::uuid RETURNING id", [id, this.userId]);
      if (!rows.length) throw new AppError(404, "Conversation not found.");
    } else {
      await this.query("DELETE FROM fala.sessions WHERE user_id=$1::uuid", [this.userId]);
      await new Rewards(this, this.userId).reset();
    }
  }

  async deleteAccount() {
    await this.query("DELETE FROM fala.users WHERE id=$1::uuid", [this.userId]);
    await this.query("DELETE FROM fala.usage_limits WHERE bucket IN ($1,$2)", [`minute:${this.userId}`, `day:${this.userId}`]);
  }

  async ping() { await this.query("SELECT 1 AS ready FROM fala.sessions LIMIT 1"); }
}

export function publicSession(session: Session) {
  const { request: _request, user_id: _user, ...rest } = session as Session & { user_id?: string };
  const level = practiceLevel(session.request.resolved_level);
  return { ...rest, feedback: session.feedback ? compactFeedback(session.feedback, session) : null,
    capoeira: Boolean(session.request.resolved_lesson) || /capoeira/i.test(session.request.topic),
    practice: { level: level.level, title: level.title, goal: level.goal, answer_goal: level.answer_goal },
    support_language: session.request.support_language ?? "en-US", target_turns: PRACTICE_TURNS, demo: Number(session.demo), turns: session.turns.map(t => {
    const { request: _request, ...turn } = t as Turn & { request?: TurnInput };
    return { ...turn, help: Number(t.help) };
  }) };
}
