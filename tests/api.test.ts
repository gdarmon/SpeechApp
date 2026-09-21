import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { createHandler } from "../src/api.js";
import { settingsFromEnv } from "../src/config.js";
import { connectDatabase, type Database, type Executor, type Parameter } from "../src/database.js";
import { AppError, feedbackSchema, replySchema, type Feedback } from "../src/models.js";
import { CompatibleProvider, type AIProvider } from "../src/provider.js";
import { Timing } from "../src/timing.js";

const nativeDatabaseUrl = process.env.FALA_TEST_DATABASE_URL;
if (nativeDatabaseUrl) {
  const url = new URL(nativeDatabaseUrl);
  // This suite truncates its fixtures. Never allow it to target a real deployment.
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/fala_test") {
    throw new Error("FALA_TEST_DATABASE_URL must target the disposable local fala_test database.");
  }
}
const settings = settingsFromEnv({ FALA_TOKEN: "private-test-token-32-characters-long",
  DATABASE_URL: nativeDatabaseUrl || "postgres://local:pass@localhost/fala", FALA_LOCAL_DATABASE: "true", OPENAI_API_KEY: "test-key" });
const firstMigration = await readFile(new URL("../supabase/migrations/202609180001_fala.sql", import.meta.url), "utf8");
const secondMigration = await readFile(new URL("../supabase/migrations/202609180002_google_sign_in.sql", import.meta.url), "utf8");
const repairMigration = await readFile(new URL("../supabase/migrations/202609190001_repair_serialized_json.sql", import.meta.url), "utf8");
const rewardsMigration = await readFile(new URL("../supabase/migrations/202609200001_rewards.sql", import.meta.url), "utf8");
const instructorMigration = await readFile(new URL("../supabase/migrations/202609210001_instructors.sql", import.meta.url), "utf8");
const migration = firstMigration + secondMigration + repairMigration + rewardsMigration + instructorMigration;
let pg: { exec(sql: string): Promise<unknown>; query<T = Record<string, unknown>>(sql: string, values?: Parameter[]): Promise<{ rows: T[] }> };
let db: Database;
let coach: Coach;
let handler: ReturnType<typeof createHandler>;
const correction = { key: "past_tense", category: "grammar" as const, said: "Ontem eu vai ao parque", natural: "Ontem eu fui ao parque", explanation: "Use fui for a completed trip.", example: "Eu fui ao mercado ontem." };
class Coach implements AIProvider {
  demo = false;
  calls: Record<string, unknown>[] = [];
  report: Feedback = feedbackSchema.parse({ summary: "Boa conversa!", corrections: [correction] });
  fail = false;
  async reply(context: Record<string, unknown>) {
    this.calls.push(context);
    if (this.fail) throw new AppError(503, "Try again.");
    const hebrew = context.support_language === "he-IL";
    return replySchema.parse({ text: "Que legal! E depois?", topic: "Daily life", practice_phrase: context.action === "help" ? "Quero uma mesa para dois." : "",
      translation: hebrew ? "איזה יופי! ומה קרה אחר כך?" : "How nice! What happened next?",
      turn_feedback: context.action === "continue" ? ((context.input as { text: string }).text.includes(correction.said)
        ? { kind: "correction", message: correction.explanation, said: correction.said, natural: correction.natural }
        : { kind: "ok", message: hebrew ? "התשובה הזאת מתאימה." : "That answer works." }) : null,
      suggested_replies: [{ text: "Fui tomar um café.", translation: hebrew ? "הלכתי לשתות קפה." : "I went for a coffee." }] });
  }
  async feedback(context: Record<string, unknown>) {
    if (this.fail) throw new AppError(503, "Try again.");
    return { ...structuredClone(this.report), vocabulary: (context.vocabulary_words as string[]).map(word => ({ word, translation: `Meaning of ${word}` })) };
  }
}
function instance() { return createHandler({ settings: () => settings, database: () => db, provider: () => coach, region: () => "us-east-2" }); }
async function call(path: string, method = "GET", body?: unknown, target = handler, token = settings.token) {
  const response = await target(new Request(`https://fala.test${path}`, { method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
  return { status: response.status, data: await response.json(), headers: response.headers };
}
const start = (extra = {}) => call("/sessions", "POST", { request_id: randomUUID(), ...extra });
const turn = (id: string, extra = {}) => call(`/sessions/${id}/turns`, "POST", { request_id: randomUUID(), text: correction.said, speech_ms: 5000, ...extra });
const finish = (id: string, confidence?: string) => call(`/sessions/${id}/finish`, "POST", confidence ? { confidence } : {});

beforeAll(async () => {
  if (nativeDatabaseUrl) {
    db = connectDatabase(settings);
    pg = { exec: sql => db.query(sql), query: async <T>(sql: string, values?: Parameter[]) => ({ rows: await db.query<T>(sql, values) }) };
  } else {
    const embedded = new PGlite();
    pg = embedded;
    const wrap = (client: Pick<PGlite, "query">): Executor => ({ query: async <T>(sql: string, values: Parameter[] = []) => (await client.query<T>(sql, values)).rows });
    db = { ...wrap(embedded), transaction: fn => embedded.transaction(tx => fn(wrap(tx))), close: () => embedded.close() };
  }
  await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  await pg.exec(migration);
}, 30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await pg.exec("TRUNCATE fala.sessions, fala.turns, fala.evidence, fala.rate_limit, fala.usage_limits, fala.reward_events, fala.reward_profiles, fala.reminder_deliveries RESTART IDENTITY;");
  coach = new Coach(); handler = instance();
});

describe("Netlify API against PostgreSQL", () => {
  it("grounds a learner's movement question outside the current lesson without rewriting their transcript", async () => {
    const session = (await start({ topic: "capoeira class", support_language: "he-IL" })).data;
    const input = { text: "O que é au sem mau?", source: "typed", speech_ms: 0 };
    expect((await turn(session.id, input)).status).toBe(200);
    expect(coach.calls.at(-1)?.lesson).toMatchObject({ id: "kicks-v1" });
    expect(coach.calls.at(-1)?.capoeira_reference).toContainEqual({ term: "aú sem mão",
      meaning: "aerial cartwheel without hand support", translation: "גלגלון באוויר ללא תמיכת הידיים" });
    expect(coach.calls.at(-1)?.input).toMatchObject(input);
    const stored = (await call(`/sessions/${session.id}`)).data;
    expect(stored.turns[0].text).toBe(input.text);
    const report = (await call(`/sessions/${session.id}/finish`, "POST", {})).data;
    expect(report.vocabulary).toContainEqual(expect.objectContaining({ word: "aú sem mão", translation: "גלגלון באוויר ללא תמיכת הידיים" }));
  });
  it("persists a rotating lesson without changing it on retries, help or resume", async () => {
    const input = { topic: "capoeira class", support_language: "he-IL", request_id: randomUUID() };
    const first = (await start(input)).data;
    expect(first.topic).toContain("Kicks in class");
    expect(first.capoeira).toBe(true);
    expect(first.request).toBeUndefined();
    expect(coach.calls.at(-1)?.lesson).toMatchObject({ id: "kicks-v1", next_prompt: { focus_term: "martelo" } });
    const calls = coach.calls.length;
    expect((await start(input)).data.id).toBe(first.id);
    expect(coach.calls.length).toBe(calls);
    coach.fail = true;
    expect((await start({ topic: "capoeira class" })).status).toBe(503);
    coach.fail = false;
    expect((await start({ resolved_lesson: { id: "kicks-v1", visit: 99 } })).status).toBe(422);
    const second = (await start({ topic: "capoeira class" })).data;
    expect(second.topic).toContain("Instruments");
    await turn(first.id, { text: "Prefiro martelo." });
    expect(coach.calls.at(-1)?.lesson).toMatchObject({ id: "kicks-v1", next_prompt: { focus_term: "queixada" } });
    await turn(first.id, { text: "Please repeat", help: true, language: "en-US" });
    expect(coach.calls.at(-1)?.lesson).toMatchObject({ id: "kicks-v1", next_prompt: { focus_term: "queixada" } });
    expect((await call(`/sessions/${first.id}`)).data.topic).toBe(first.topic);
    const review = (await finish(first.id)).data;
    expect(review.vocabulary.find((item: { word: string }) => item.word === "martelo").translation).toContain("בעיטה");
    // Existing pre-curriculum conversations remain resumable and retryable.
    await db.query("UPDATE fala.sessions SET request=request-'resolved_lesson' WHERE id=$1::uuid", [first.id]);
    expect((await start(input)).data.id).toBe(first.id);
    await db.query("UPDATE fala.sessions SET request=request-'resolved_lesson' WHERE id=$1::uuid", [second.id]);
    expect((await turn(second.id)).status).toBe(200);
    expect(coach.calls.at(-1)?.lesson).toBeUndefined();
  });
  it("persists practice levels, advances only after evidence, and recomputes after deletion", async () => {
    const answers = ["Primeiro vou levantar a mão direita.", "Depois eu vou trocar de lado.", "Eu quero repetir o movimento devagar.", "Agora vou formar uma dupla aqui.", "Vou prestar atenção no meu professor.", "Eu vou seguir o ritmo agora.", "Sim.", "Tudo bem.", "Claro.", "Obrigado."];
    const ids: string[] = [];
    const requests = [randomUUID(), randomUUID()];
    for (let i = 0; i < 2; i++) {
      const input = { practice_level: 2, topic: "capoeira class", request_id: requests[i] };
      const session = (await start(input)).data; ids.push(session.id);
      expect(session.practice.level).toBe(2);
      expect(coach.calls.at(-1)?.practice).toMatchObject({ level: 2 });
      for (const text of answers) expect((await turn(session.id, { text, source: "speech", assisted: false })).status).toBe(200);
      const result = await finish(session.id);
      expect(result.status).toBe(200);
      expect(result.data.practice_result).toMatchObject({ level: 2, successful_answers: 6, ready: true });
      expect(result.data.vocabulary.length).toBeLessThanOrEqual(5);
      expect((await call("/progress")).data.practice.level).toBe(i === 0 ? 1 : 3);
    }
    expect((await start({ practice_level: 2, topic: "capoeira class", request_id: requests[0] })).data.id).toBe(ids[0]);
    const next = (await start()).data;
    expect(next.practice.level).toBe(3);
    expect((await call(`/sessions/${ids[0]}`)).data.practice.level).toBe(2);
    await call(`/sessions/${ids[0]}`, "DELETE");
    expect((await call("/progress")).data.practice.level).toBe(1);
    expect((await start({ practice_level: 6 })).status).toBe(422);
    expect((await start({ resolved_level: 5 })).status).toBe(422);
    expect((await turn(next.id, { ideas_hidden: true, assisted: true })).status).toBe(422);
  });
  it("can continue and summarize replies saved before translations and feedback existed", async () => {
    const session = (await start()).data;
    await turn(session.id);
    await db.query("UPDATE fala.sessions SET opening=opening-'suggested_replies'-'translation'-'turn_feedback' WHERE id=$1::uuid", [session.id]);
    await db.query("UPDATE fala.turns SET reply=reply-'suggested_replies'-'translation'-'turn_feedback' WHERE session_id=$1::uuid", [session.id]);
    expect((await turn(session.id)).status).toBe(200);
    expect(coach.calls.at(-1)?.turns).toEqual(expect.arrayContaining([expect.objectContaining({ reply: expect.objectContaining({ suggested_replies: [] }) })]));
    expect((await finish(session.id)).status).toBe(200);
  });
  it("saves immediate feedback, counts ten answers without help turns, and keeps a grounded vocabulary summary", async () => {
    coach.report.pointers = ["Practice a short reply without reading the suggestion."];
    const session = (await start()).data;
    expect(session.target_turns).toBe(10);
    await turn(session.id, { text: "Please translate pineapple", help: true, language: "en-US" });
    expect(coach.calls.at(-1)?.practice_round).toBe(0);
    for (let i = 1; i <= 10; i++) {
      const result = await turn(session.id, { text: "Quero abacaxi." });
      expect(result.data.turn_feedback).toMatchObject({ kind: "ok" });
      expect(coach.calls.at(-1)?.practice_round).toBe(i);
      expect(coach.calls.at(-1)?.last_turn).toBe(i === 10);
    }
    const report = (await finish(session.id)).data;
    expect(report.pointers).toContain("Next time, try one short answer without reading the suggestion.");
    expect(report.vocabulary.find((word: { word: string }) => word.word === "abacaxi")).toMatchObject({ occurrences: 10, seen_before: false, translation: "Meaning of abacaxi" });
    expect(report.vocabulary.some((word: { word: string }) => word.word === "pineapple")).toBe(false);
    expect((await finish(session.id)).data).toEqual(report);
    const resumed = (await call(`/sessions/${session.id}`)).data;
    expect(resumed.turns[1].reply.turn_feedback).toMatchObject({ kind: "ok" });
    expect(resumed.feedback.vocabulary).toEqual(report.vocabulary);
    const later = (await start()).data;
    await turn(later.id, { text: "Abacaxi." });
    expect((await finish(later.id)).data.vocabulary.find((word: { word: string }) => word.word === "abacaxi").seen_before).toBe(true);
    await call(`/sessions/${session.id}`, "DELETE");
    await call(`/sessions/${later.id}`, "DELETE");
    const afterDeletion = (await start()).data;
    await turn(afterDeletion.id, { text: "Abacaxi." });
    expect((await finish(afterDeletion.id)).data.vocabulary.find((word: { word: string }) => word.word === "abacaxi").seen_before).toBe(false);
  });
  it("remembers the support language and returns translations and reply ideas on start, turns, and resume", async () => {
    for (const language of ["en-US", "he-IL"]) {
      const response = await start({ support_language: language });
      expect(response.status).toBe(200);
      expect(response.data.support_language).toBe(language);
      expect(coach.calls.at(-1)?.support_language).toBe(language);
      expect(response.data.opening.translation).toBe(language === "he-IL" ? "איזה יופי! ומה קרה אחר כך?" : "How nice! What happened next?");
      expect(response.data.opening.suggested_replies[0].text).toBe("Fui tomar um café.");
      await turn(response.data.id);
      const resumed = (await call(`/sessions/${response.data.id}`)).data;
      expect(resumed.support_language).toBe(language);
      expect(resumed.turns[0].reply.translation).toBe(response.data.opening.translation);
    }
    expect((await start({ support_language: "fr-FR" })).status).toBe(422);
  });
  it("keeps typed and guided answers out of spontaneous speaking assessment", async () => {
    const dimension = { observation: "Good", evidence: "Fui tomar um café." };
    coach.report.assessment = { cefr: "B1", comprehension: dimension, vocabulary: dimension, grammar: dimension,
      sentence_construction: dimension, fluency: dimension, pronunciation: dimension, confidence: dimension };
    for (const source of ["typed", "suggested", "copied"]) {
      const session = (await start({ kind: "assessment" })).data;
      for (let i = 0; i < 5; i++) await turn(session.id, { text: "Fui tomar um café.",
        source: source === "typed" ? "typed" : "speech", speech_ms: source === "typed" ? 0 : 1000,
        assisted: source === "suggested" });
      const saved = (await call(`/sessions/${session.id}`)).data;
      expect(saved.turns[0].source).toBe(source === "typed" ? "typed" : "speech");
      expect(saved.turns[0].assisted).toBe(source === "suggested");
      expect((await finish(session.id)).data.assessment).toBeNull();
    }
    const progress = (await call("/progress")).data;
    expect(progress.typed_turns).toBe(5);
    expect(progress.learner_turns).toBe(10);
    expect(progress.speech_ms).toBe(10000);
    const session = (await start()).data;
    expect((await turn(session.id, { source: "typed", speech_ms: 1000 })).status).toBe(422);
  });
  it("keeps health public and all learner data authenticated", async () => {
    expect((await call("/health", "GET", undefined, handler, "wrong")).status).toBe(200);
    for (const route of ["/sessions", "/dashboard", "/diagnostics", "/progress"]) expect((await call(route, "GET", undefined, handler, "wrong")).status).toBe(401);
    const response = await call("/api/diagnostics");
    expect(response.data.function_region).toBe("us-east-2");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Server-Timing")).toContain("db;dur=");
    expect(JSON.stringify(response.data)).not.toContain("pass");
  });
  it("runs the migration again without deleting data and denies public database roles", async () => {
    const session = (await start()).data;
    await pg.exec(migration);
    expect((await call(`/sessions/${session.id}`)).status).toBe(200);
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`SET ROLE ${role}`);
      try { await expect(pg.query("SELECT * FROM fala.sessions")).rejects.toMatchObject({ code: "42501" }); }
      finally { await pg.exec("RESET ROLE"); }
    }
    const policies = await pg.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE oid='fala.sessions'::regclass");
    expect(policies.rows[0].relrowsecurity).toBe(true);
  });
  it("preserves start and turn retry IDs across independent function handlers", async () => {
    const input = { request_id: randomUUID() };
    const first = await call("/sessions", "POST", input);
    expect(first.status).toBe(200);
    expect(first.data.opening).toMatchObject({ text: "Que legal! E depois?" });
    const retry = await call("/sessions", "POST", input, instance());
    expect(retry.data.id).toBe(first.data.id);
    expect(coach.calls.length).toBe(1);
    expect((await call("/sessions", "POST", { ...input, topic: "Travel" })).status).toBe(409);
    const body = { request_id: randomUUID(), text: correction.said };
    const [a, b] = await Promise.all([call(`/sessions/${first.data.id}/turns`, "POST", body), call(`/sessions/${first.data.id}/turns`, "POST", body, instance())]);
    expect(a.status).toBe(200); expect(b.status).toBe(200); expect(b.data).toEqual(a.data);
    expect(coach.calls.length).toBe(2);
    expect((await call(`/sessions/${first.data.id}/turns`, "POST", { ...body, text: "Outra coisa" })).status).toBe(409);
    const saved = (await call(`/sessions/${first.data.id}`)).data;
    expect(saved.turns).toHaveLength(1); expect(saved.turns[0].help).toBe(0);
    expect(saved.opening).toEqual(first.data.opening);
    expect(saved.turns[0].reply).toEqual(a.data);
    expect(saved.request).toBeUndefined(); expect(saved.turns[0].request).toBeUndefined();
  });
  it("repairs double-encoded conversation JSON without losing retry IDs, feedback, or memory", async () => {
    const input = { request_id: randomUUID() };
    const original = (await call("/sessions", "POST", input)).data;
    const turnInput = { request_id: randomUUID(), text: correction.said };
    const reply = (await call(`/sessions/${original.id}/turns`, "POST", turnInput)).data;
    const report = (await finish(original.id)).data;
    const before = (await call(`/sessions/${original.id}`)).data;
    await pg.exec(`UPDATE fala.sessions SET request=to_jsonb(request::text),opening=to_jsonb(opening::text),feedback=to_jsonb(feedback::text);
      UPDATE fala.turns SET request=to_jsonb(request::text),reply=to_jsonb(reply::text);
      UPDATE fala.evidence SET correction=to_jsonb(correction::text);`);
    for (let run = 0; run < 2; run++) {
      await pg.exec(repairMigration);
      expect((await call(`/sessions/${original.id}`)).data).toEqual(before);
      expect((await call("/sessions", "POST", input)).data.id).toBe(original.id);
      expect((await call(`/sessions/${original.id}/turns`, "POST", turnInput)).data).toEqual(reply);
      expect((await finish(original.id)).data).toEqual(report);
      expect((await call("/progress")).data.memory[0]).toMatchObject(report.corrections[0]);
    }
  });
  it("rolls back provider failures and permits a safe retry", async () => {
    const session = (await start()).data;
    coach.fail = true;
    expect((await turn(session.id)).status).toBe(503);
    expect((await call(`/sessions/${session.id}`)).data.turns).toHaveLength(0);
    expect((await finish(session.id)).status).toBe(503);
    expect((await call(`/sessions/${session.id}`)).data.ended_at).toBeNull();
    coach.fail = false;
    expect((await turn(session.id)).status).toBe(200);
  });
  it("stores evidenced feedback once, remembers distinct conversations and cascades deletion", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const session = (await start()).data; ids.push(session.id);
      await turn(session.id);
      const a = await finish(session.id);
      expect(a.data.corrections).toHaveLength(1);
      expect((await finish(session.id)).data).toEqual(a.data);
      expect((await turn(session.id)).status).toBe(409);
    }
    const progress = (await call("/dashboard")).data.progress;
    expect(progress.conversations).toBe(2); expect(progress.speech_ms).toBe(10000);
    expect(progress.memory[0].occurrences).toBe(2);
    await call(`/sessions/${ids[0]}`, "DELETE");
    expect((await call("/progress")).data.memory[0].occurrences).toBe(1);
    await call("/learner", "DELETE"); await call("/learner", "DELETE");
    expect((await call("/progress")).data.memory).toEqual([]);
    expect((await call("/sessions")).data).toEqual([]);
    expect((await pg.query("SELECT * FROM fala.turns")).rows).toEqual([]);
  });
  it("separates English and Hebrew assistance from spontaneous evidence", async () => {
    const session = (await start()).data;
    for (const language of ["en-US", "he-IL"]) expect((await turn(session.id, { text: "Table for two", help: true, language })).status).toBe(200);
    const result = await finish(session.id);
    expect(result.data.corrections).toEqual([]);
    expect(result.data.review_phrases).toEqual(["Quero uma mesa para dois."]);
    const progress = (await call("/progress")).data;
    expect(progress.help_requests).toBe(2); expect(progress.speech_ms).toBe(0); expect(progress.conversations).toBe(0);
    expect(progress.help_patterns[0].occurrences).toBe(1);
    expect(coach.calls.at(-1)?.action).toBe("help");
  });
  it("rolls back the report when saving its learner evidence fails", async () => {
    const session = (await start()).data; await turn(session.id);
    await pg.exec(`CREATE FUNCTION fala.reject_test_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Test failure'; END $$;
      CREATE TRIGGER reject_test BEFORE INSERT ON fala.evidence FOR EACH ROW EXECUTE FUNCTION fala.reject_test_evidence();`);
    try {
      expect((await finish(session.id)).status).toBe(503);
      const saved = (await call(`/sessions/${session.id}`)).data;
      expect(saved.feedback).toBeNull(); expect(saved.ended_at).toBeNull();
    } finally { await pg.exec("DROP TRIGGER reject_test ON fala.evidence; DROP FUNCTION fala.reject_test_evidence();"); }
    expect((await finish(session.id)).status).toBe(200);
  });
  it("returns a retryable conflict when another database transaction holds the learner lock", async () => {
    const contended: Database = { ...db, transaction: fn => fn({ query: async <T>() => [{ locked: false }] as T[] }) };
    const target = createHandler({ settings: () => settings, database: () => contended, provider: () => coach });
    const response = await call("/sessions", "POST", { request_id: randomUUID() }, target);
    expect(response.status).toBe(409); expect(coach.calls).toEqual([]);
  });
  it("reintroduces due weaknesses and bounds the active context", async () => {
    const first = (await start()).data; await turn(first.id); await finish(first.id);
    await pg.exec("UPDATE fala.evidence SET observed_at=now()-interval '2 days'");
    const second = (await start()).data;
    expect((coach.calls.at(-1)?.weaknesses as unknown[])).toHaveLength(1);
    for (let i = 0; i < 14; i++) await turn(second.id);
    expect((coach.calls.at(-1)?.turns as unknown[])).toHaveLength(12);
  });
  it("discards invented, already-correct and age-statement corrections", async () => {
    coach.report.corrections = [ { ...correction, said: "Eu tenho 44 anos", natural: "Tenho 44 anos" },
      { ...correction, key: "invented", said: "I never said this" },
      { ...correction, key: "punctuation", said: "Tudo bem", natural: "Tudo bem!" } ];
    const session = (await start()).data;
    await turn(session.id, { text: "Eu tenho 44 anos. Tudo bem." });
    expect((await finish(session.id)).data.corrections).toEqual([]);
  });
  it("requires assessment evidence and does not infer pronunciation or confidence", async () => {
    const dimension = { observation: "Good", evidence: correction.said };
    coach.report.assessment = { cefr: "B1", comprehension: dimension, vocabulary: dimension, grammar: dimension,
      sentence_construction: dimension, fluency: dimension, pronunciation: dimension, confidence: dimension };
    const short = (await start({ kind: "assessment" })).data; await turn(short.id);
    expect((await finish(short.id)).data.assessment).toBeNull();
    const session = (await start({ kind: "assessment" })).data;
    for (let i = 0; i < 5; i++) await turn(session.id);
    coach.report.assessment.vocabulary = { observation: "Unsupported", evidence: "never spoken" };
    const report = (await finish(session.id, "okay")).data.assessment;
    expect(report.cefr).toBe("B1"); expect(report.vocabulary.evidence).toBe("");
    expect(report.pronunciation.observation).toContain("Not assessed");
    expect(report.confidence.observation).toBe("Self-reported: okay");
  });
  it("excludes scripted demo sessions from learning metrics and blocks mode changes", async () => {
    coach.demo = true;
    const session = (await start()).data; await turn(session.id); await finish(session.id);
    const progress = (await call("/progress")).data;
    expect(progress.memory).toEqual([]); expect(progress.conversations).toBe(0); expect(progress.speech_ms).toBe(0);
    const active = (await start()).data; coach.demo = false;
    expect((await turn(active.id)).status).toBe(409);
  });
  it("validates inputs and enforces a database-backed request budget", async () => {
    expect((await start({ request_id: "short" })).status).toBe(422);
    expect((await start({ topic: "x".repeat(25000) })).status).toBe(413);
    expect((await start({ unexpected: "field" })).status).toBe(422);
    const session = (await start()).data;
    expect((await turn(session.id, { language: "he-IL", help: false })).status).toBe(422);
    expect((await turn(session.id, { speech_ms: -1 })).status).toBe(422);
    await pg.exec("UPDATE fala.usage_limits SET requests=30");
    const limited = await call("/sessions", "POST", { request_id: randomUUID() }, instance());
    expect(limited.status).toBe(429); expect(limited.headers.get("Retry-After")).toBe("60");
    expect((await call("/sessions")).status).toBe(200);
  });
});

describe("provider contract and configuration", () => {
  it("retries a brief provider throttle once without changing the prompt or retrying long quota limits", async () => {
    const reply = replySchema.parse({ text: "Oi! Tudo bem?", translation: "Hi! How are you?", pace: "slow",
      suggested_replies: [{ text: "Tudo bem.", translation: "I'm well." }, { text: "Mais ou menos.", translation: "So-so." }] });
    for (const retryAfter of ["0", "120", null]) {
      const bodies: string[] = [];
      const ai = new CompatibleProvider(settings, new Timing(), async (_url, init) => {
        bodies.push(init!.body as string);
        if (bodies.length === 1) return new Response("", { status: 429, headers: retryAfter === null ? {} : { "Retry-After": retryAfter } });
        return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(reply) } }] });
      });
      if (retryAfter === "0") {
        expect(await ai.reply({ action: "start" })).toEqual(reply);
        expect(bodies).toHaveLength(2);
        expect(bodies[0]).toBe(bodies[1]);
      } else {
        await expect(ai.reply({ action: "start" })).rejects.toMatchObject({ status: 503 });
        expect(bodies).toHaveLength(1);
      }
    }
  });
  it("uses strict coaching output for Groq and OpenAI while leaving other providers compatible", async () => {
    const reply = replySchema.parse({ text: "Com leite?", translation: "With milk?", pace: "slow", turn_feedback: { kind: "ok", message: "That answer works." },
      suggested_replies: [{ text: "Sim.", translation: "Yes." }, { text: "Não.", translation: "No." }] });
    for (const baseUrl of [settings.baseUrl, "https://api.openai.com/v1", "https://compatible.example/v1"]) {
      const openai = baseUrl === "https://api.openai.com/v1";
      const ai = new CompatibleProvider({ ...settings, baseUrl, model: openai ? "gpt-5.6-terra" : settings.model }, new Timing(), async (_url, init) => {
        const body = JSON.parse(init!.body as string);
        if (openai) { expect(body.store).toBe(false); expect(body.reasoning_effort).toBe("low"); }
        if (baseUrl === settings.baseUrl || openai) {
          expect(body.response_format.type).toBe("json_schema");
          const schema = body.response_format.json_schema;
          expect(schema.strict).toBe(true);
          const variants = schema.schema.properties.turn_feedback.anyOf;
          expect(variants.every((variant: { type: string }) => variant.type === "object")).toBe(true);
          expect(schema.schema.required).toContain("turn_feedback");
          expect(variants[0].required).toEqual(expect.arrayContaining(["kind", "message", "said", "natural"]));
          expect(variants[1].properties.natural.const).toBe("");
          expect(schema.schema.properties.suggested_replies.minItems).toBe(2);
          expect(schema.schema.additionalProperties).toBe(false);
        } else expect(body.response_format).toEqual({ type: "json_object" });
        return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(reply) } }] });
      });
      expect(await ai.reply({ action: "continue", support_language: "en-US", input: { text: "Um café." } })).toEqual(reply);
    }
  });
  it("allows factual app summaries while still requiring all vocabulary meanings", async () => {
    const ai = new CompatibleProvider(settings, new Timing(), async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      expect(body.messages[0].content).toContain("Select corrections ONLY from coached_corrections");
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
        summary: "Practice complete.", pointers: [], vocabulary: [{ word: "café", translation: "קפה" }],
      }) } }] });
    });
    expect((await ai.feedback({ coached_corrections: [], support_language: "he-IL", vocabulary_words: ["café"] })).pointers).toEqual([]);
  });
  it("requires pointers and a translation for every actual session word", async () => {
    let calls = 0;
    const report = { summary: "A short practice.", pointers: ["Try ordering a coffee."], vocabulary: [
      { word: "café", translation: "coffee" }, { word: "leite", translation: "milk" },
    ] };
    const ai = new CompatibleProvider(settings, new Timing(), async () => {
      calls++;
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(calls === 1 ? { ...report, vocabulary: report.vocabulary.slice(0,1) } : report) } }] });
    });
    expect((await ai.feedback({ vocabulary_words: ["café", "leite"] })).vocabulary).toEqual(report.vocabulary);
    expect(calls).toBe(2);
  });
  it("validates output, requests coaching reasoning and rejects truncated JSON", async () => {
    const reply = replySchema.parse({ text: "Oi! Tudo bem?", translation: "Hi! How are you?", suggested_replies: [
      { text: "Tudo bem?", translation: "How are you?" }, { text: "Oi, como vai?", translation: "Hi, how's it going?" },
    ] });
    const ai = new CompatibleProvider(settings, new Timing(), async (_url, init) => {
      const sent = JSON.parse(init!.body as string);
      expect(sent.reasoning_effort).toBe("medium"); expect(init!.redirect).toBe("error");
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(reply) } }] });
    });
    expect(await ai.reply({})).toEqual(reply);
    for (const [reason, content] of [["length", JSON.stringify(reply)], ["stop", "{bad"], ["stop", '{"text":""}'],
      ["stop", JSON.stringify({ ...reply, translation: "" })], ["stop", JSON.stringify({ ...reply, suggested_replies: [] })],
      ["stop", JSON.stringify({ ...reply, suggested_replies: [{ text: "Um café aconגן.", translation: "A cozy cafe." }, reply.suggested_replies[1]] })]]) {
      const broken = new CompatibleProvider(settings, new Timing(), async () => Response.json({ choices: [{ finish_reason: reason, message: { content } }] }));
      await expect(broken.reply({})).rejects.toMatchObject({ status: 503 });
    }
  });
  it("regenerates a malformed translated reply once within the original timeout", async () => {
    const valid = replySchema.parse({ text: "Oi! Tudo bem?", translation: "היי! מה שלומך?", suggested_replies: [
      { text: "Quero um café.", translation: "אני רוצה קפה." }, { text: "Prefiro chá.", translation: "אני מעדיף תה." },
    ] });
    let calls = 0;
    const ai = new CompatibleProvider(settings, new Timing(), async (_url, init) => {
      calls++;
      expect(init?.signal).toBeDefined();
      if (calls === 2) expect(JSON.parse(init!.body as string).messages[0].content).toContain("previous generation");
      const reply = calls === 1 ? { ...valid, text: "Oi, שלום!" } : valid;
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(reply) } }] });
    });
    expect(await ai.reply({ support_language: "he-IL" })).toEqual(valid);
    expect(calls).toBe(2);
  });
  it("does not leak provider failures or keys", async () => {
    const broken = new CompatibleProvider(settings, new Timing(), async () => { throw new Error("secret connection string"); });
    await expect(broken.reply({})).rejects.not.toThrow("secret");
    const missing = new CompatibleProvider({ ...settings, apiKey: "" }, new Timing(), async () => { throw new Error("Should not call"); });
    await expect(missing.reply({})).rejects.toMatchObject({ status: 503 });
  });
  it("requires valid secrets, secure endpoints and bounded timeouts", () => {
    const env = { FALA_TOKEN: settings.token, DATABASE_URL: settings.databaseUrl };
    for (const extra of [{ FALA_TOKEN: "short" }, { DATABASE_URL: "https://bad" }, { AI_TIMEOUT_MS: "60000" },
      { OPENAI_BASE_URL: "http://remote.test" }, { FALA_LOCAL_DATABASE: "true", NETLIFY: "true" }]) {
      expect(() => settingsFromEnv({ ...env, ...extra })).toThrow(AppError);
    }
    expect(settingsFromEnv(env).demo).toBe(false);
  });
  it("switches paid OpenAI credentials, model and destination together without reusing Groq settings", () => {
    const env = { FALA_TOKEN: settings.token, DATABASE_URL: settings.databaseUrl,
      OPENAI_API_KEY: "groq-fixture", OPENAI_BASE_URL: settings.baseUrl, OPENAI_MODEL: "openai/gpt-oss-120b" };
    expect(settingsFromEnv(env)).toMatchObject({ apiKey: "groq-fixture", baseUrl: settings.baseUrl, model: "openai/gpt-oss-120b" });
    expect(settingsFromEnv({ ...env, FALA_OPENAI_API_KEY: " openai-fixture " })).toMatchObject({
      apiKey: "openai-fixture", baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-terra",
    });
    expect(settingsFromEnv({ ...env, FALA_OPENAI_API_KEY: "openai-fixture", FALA_OPENAI_MODEL: "gpt-5.6-sol" }).model).toBe("gpt-5.6-sol");
    expect(settingsFromEnv({ ...env, OPENAI_BASE_URL: "https://api.openai.com/v1", OPENAI_MODEL: "" }).model).toBe("gpt-5.6-terra");
  });
});
