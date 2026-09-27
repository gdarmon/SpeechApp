// Explicit opt-in against disposable LOCAL PostgreSQL only. Uses the real API,
// auth, driver, transactions and rewards, with a controlled fake AI delay.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHandler } from "../src/api.js";
import { settingsFromEnv } from "../src/config.js";
import { connectDatabase, type Database } from "../src/database.js";
import { feedbackSchema, replySchema } from "../src/models.js";
import type { AIProvider } from "../src/provider.js";

const databaseUrl = process.env.FALA_CONCURRENCY_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || url.pathname !== "/fala_concurrency_test" || url.username !== "fala_test") {
    throw Error("Use only the disposable local fala_concurrency_test database with the fala_test user.");
  }
}

const learners = 50, aiDelayMs = 25;
const settings = settingsFromEnv({ DATABASE_URL: databaseUrl || "postgres://fala_test@localhost/fala_concurrency_test",
  FALA_LOCAL_DATABASE: "true", GOOGLE_WEB_CLIENT_ID: "synthetic-test.apps.googleusercontent.com",
  FALA_DAILY_USER_LIMIT: "0", FALA_DAILY_APP_LIMIT: "0" });
const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round((sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0) * 10) / 10;
};
const stats = (values: number[]) => ({ samples: values.length, p50: percentile(values, .5), p95: percentile(values, .95), max: percentile(values, 1) });

describe.skipIf(!databaseUrl)("full sessions sharing one production database pool", () => {
  let database: Database, ownsSchema = false;
  const actors = Array.from({ length: learners }, (_, index) => ({ id: randomUUID(), marker: `aluno${index}`,
    token: `fala_${randomBytes(32).toString("base64url")}`, session: "" }));
  beforeAll(async () => {
    database = connectDatabase(settings);
    const [target] = await database.query<{ name: string; occupied: boolean }>(
      "SELECT current_database() AS name, EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='fala') AS occupied");
    expect(target).toEqual({ name: "fala_concurrency_test", occupied: false });
    ownsSchema = true;
    await database.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;");
    const migrations = new URL("../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(migrations)).filter(name => name.endsWith(".sql")).sort()) {
      await database.query(await readFile(new URL(file, migrations), "utf8"));
    }
    for (const actor of actors) {
      await database.query("INSERT INTO fala.users(id,google_subject,email) VALUES($1::uuid,$2,$3)",
        [actor.id, `synthetic-${actor.id}`, `${actor.marker}@example.invalid`]);
      await database.query("INSERT INTO fala.device_sessions(token_hash,user_id,expires_at) VALUES($1,$2::uuid,now()+interval '1 hour')",
        [createHash("sha256").update(actor.token).digest("hex"), actor.id]);
    }
  }, 30000);
  afterAll(async () => {
    if (!database) return;
    try { if (ownsSchema) await database.query("DROP SCHEMA fala CASCADE"); }
    finally { await database.close(); }
  });

  it("keeps 50 complete conversations isolated, retries idempotent and reviews bounded while measuring contention", async () => {
    let activeAI = 0, maxActiveAI = 0, aiCalls = 0;
    const transactionWait: number[] = [], aiDuration: number[] = [];
    const samples: { phase: string; status: number; total_ms: number }[] = [];
    const violations: string[] = [];
    const measuredDatabase: Database = { ...database, transaction: async action => {
      const queued = performance.now();
      return database.transaction(async tx => {
        transactionWait.push(performance.now() - queued);
        return action(tx);
      });
    } };
    async function generate(context: Record<string, unknown>) {
      const marker = String(context.topic).match(/aluno\d+/)?.[0];
      const markers = JSON.stringify(context).match(/aluno\d+/g) ?? [];
      if (!marker || markers.some(value => value !== marker)) violations.push("mixed_context");
      const started = performance.now();
      activeAI++; aiCalls++; maxActiveAI = Math.max(maxActiveAI, activeAI);
      try { await new Promise(resolve => setTimeout(resolve, aiDelayMs)); }
      finally { activeAI--; aiDuration.push(performance.now() - started); }
      return marker ?? "missing";
    }
    const provider: AIProvider = {
      demo: false,
      reply: async context => {
        const marker = await generate(context);
        return replySchema.parse({ text: `Você gosta de café, ${marker}?`, topic: String(context.topic),
          translation: "Do you like coffee?", suggested_replies: [{ text: "Eu gosto de café.", translation: "I like coffee." }],
          turn_feedback: context.action === "continue" ? { kind: "ok", message: "That answer works." } : null });
      },
      feedback: async context => {
        await generate(context);
        return feedbackSchema.parse({ summary: "You practised a complete conversation.",
          vocabulary: (context.vocabulary_words as string[]).map(word => ({ word, translation: "Synthetic meaning" })) });
      },
    };
    const handler = createHandler({ settings: () => settings, database: () => measuredDatabase, provider: () => provider });
    async function call(actor: typeof actors[number], phase: string, path: string, method = "GET", body?: unknown) {
      const started = performance.now();
      const response = await handler(new Request(`https://synthetic.test${path}`, { method,
        headers: { Authorization: `Bearer ${actor.token}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
      samples.push({ phase, status: response.status, total_ms: performance.now() - started });
      return { status: response.status, data: await response.json() };
    }
    const startedAt = new Date().toISOString();
    // Same request IDs across accounts deliberately exercise account ownership.
    const openingId = randomUUID();
    await Promise.all(actors.map(async actor => {
      const result = await call(actor, "start", "/sessions", "POST", { request_id: openingId,
        topic: `Daily life ${actor.marker}`, support_language: "en-US", practice_level: 1 });
      expect(result.status).toBe(200); actor.session = result.data.id;
    }));
    expect(new Set(actors.map(actor => actor.session)).size).toBe(learners);
    await Promise.all(actors.map(async (actor, index) => {
      const foreign = actors[(index + 1) % actors.length].session;
      expect((await call(actor, "foreign_read", `/sessions/${foreign}`)).status).toBe(404);
      expect((await call(actor, "foreign_write", `/sessions/${foreign}/turns`, "POST",
        { request_id: randomUUID(), text: "Eu gosto de café." })).status).toBe(404);
    }));
    for (let turn = 1; turn <= 10; turn++) {
      const requestId = randomUUID();
      await Promise.all(actors.map(async actor => {
        const input = { request_id: requestId, text: `Eu gosto de café, ${actor.marker}.`, source: "typed", assisted: true };
        const result = await call(actor, `turn_${turn}`, `/sessions/${actor.session}/turns`, "POST", input);
        expect(result.status).toBe(200);
        if (turn === 1) {
          const retry = await call(actor, "retry", `/sessions/${actor.session}/turns`, "POST", input);
          expect(retry.status).toBe(200); expect(retry.data).toEqual(result.data);
        }
      }));
    }
    await Promise.all(actors.map(async actor => {
      const saved = await call(actor, "read", `/sessions/${actor.session}`);
      expect(saved.status).toBe(200); expect(saved.data.turns).toHaveLength(10);
      expect(saved.data.turns.every((turn: { text: string }) => turn.text.endsWith(`${actor.marker}.`))).toBe(true);
      const result = await call(actor, "finish", `/sessions/${actor.session}/finish`, "POST", {});
      expect(result.status).toBe(200); expect(result.data.vocabulary.length).toBeLessThanOrEqual(5);
      const again = await call(actor, "finish_retry", `/sessions/${actor.session}/finish`, "POST", {});
      expect(again.status).toBe(200); expect(again.data).toEqual(result.data);
      const history = await call(actor, "history", "/sessions");
      expect(history.status).toBe(200); expect(history.data).toHaveLength(1);
      expect(history.data[0].id).toBe(actor.session);
    }));
    expect(violations).toEqual([]); expect(aiCalls).toBe(learners * 12);
    expect(maxActiveAI).toBeGreaterThan(1);
    expect(await database.query("SELECT user_id FROM fala.generation_claims")).toHaveLength(0);
    const [counts] = await database.query<{ sessions: number; turns: number }>(
      "SELECT (SELECT count(*)::int FROM fala.sessions) AS sessions, (SELECT count(*)::int FROM fala.turns) AS turns");
    expect(counts).toEqual({ sessions: learners, turns: learners * 10 });
    const report = { started_at: startedAt, finished_at: new Date().toISOString(), learners,
      note: "Local PostgreSQL, one shared production pool, in-process real API. Fake AI with a 25 ms delay; excludes hosting, network, real generation, microphone and audio. Not a user latency or capacity result.",
      successful_sessions: learners, saved_turns: learners * 10, ai_calls: aiCalls, fake_ai_delay_ms: aiDelayMs,
      max_concurrent_ai: maxActiveAI, observed_ai_ms: stats(aiDuration), transaction_acquisition_ms: stats(transactionWait),
      phases: [...new Set(samples.map(sample => sample.phase))].map(phase => {
        const rows = samples.filter(sample => sample.phase === phase);
        return { phase, requests: rows.length, statuses: [...new Set(rows.map(row => row.status))],
          total_ms: stats(rows.map(row => row.total_ms)) };
      }) };
    await mkdir("artifacts", { recursive: true });
    const file = `artifacts/session-concurrency-${Date.now()}.json`;
    await writeFile(file, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ ...report, report: file }));
  }, 90000);
});
