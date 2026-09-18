import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { createHandler } from "../src/api.js";
import { settingsFromEnv } from "../src/config.js";
import type { Database, Executor, Parameter } from "../src/database.js";
import { AppError, feedbackSchema, replySchema, type Feedback } from "../src/models.js";
import { CompatibleProvider, type AIProvider } from "../src/provider.js";
import { Timing } from "../src/timing.js";

const settings = settingsFromEnv({ FALA_TOKEN: "private-test-token-32-characters-long", DATABASE_URL: "postgres://local:pass@localhost/fala", OPENAI_API_KEY: "test-key" });
const firstMigration = await readFile(new URL("../supabase/migrations/202609180001_fala.sql", import.meta.url), "utf8");
const secondMigration = await readFile(new URL("../supabase/migrations/202609180002_google_sign_in.sql", import.meta.url), "utf8");
const migration = firstMigration + secondMigration;
let pg: PGlite;
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
    return replySchema.parse({ text: "Que legal! E depois?", topic: "Daily life", practice_phrase: context.action === "help" ? "Quero uma mesa para dois." : "" });
  }
  async feedback() { if (this.fail) throw new AppError(503, "Try again."); return structuredClone(this.report); }
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
  pg = new PGlite();
  await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  await pg.exec(migration);
  const wrap = (client: Pick<PGlite, "query">): Executor => ({ query: async <T>(sql: string, values: Parameter[] = []) => (await client.query<T>(sql, values)).rows });
  db = { ...wrap(pg), transaction: fn => pg.transaction(tx => fn(wrap(tx))), close: () => pg.close() };
}, 30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await pg.exec("TRUNCATE fala.sessions, fala.turns, fala.evidence, fala.rate_limit, fala.usage_limits RESTART IDENTITY;");
  coach = new Coach(); handler = instance();
});

describe("Netlify API against PostgreSQL", () => {
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
    expect(saved.request).toBeUndefined(); expect(saved.turns[0].request).toBeUndefined();
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
  it("validates output, requests fast reasoning and rejects truncated JSON", async () => {
    const reply = replySchema.parse({ text: "Oi!" });
    const ai = new CompatibleProvider(settings, new Timing(), async (_url, init) => {
      const sent = JSON.parse(init!.body as string);
      expect(sent.reasoning_effort).toBe("low"); expect(init!.redirect).toBe("error");
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(reply) } }] });
    });
    expect(await ai.reply({})).toEqual(reply);
    for (const [reason, content] of [["length", JSON.stringify(reply)], ["stop", "{bad"], ["stop", '{"text":""}']]) {
      const broken = new CompatibleProvider(settings, new Timing(), async () => Response.json({ choices: [{ finish_reason: reason, message: { content } }] }));
      await expect(broken.reply({})).rejects.toMatchObject({ status: 503 });
    }
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
});
