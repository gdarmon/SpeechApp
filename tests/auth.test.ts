import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from "jose";
import { googleVerifier, LEGACY_USER_ID, type GoogleIdentity } from "../src/auth.js";
import { createHandler } from "../src/api.js";
import { settingsFromEnv } from "../src/config.js";
import type { Database, Executor, Parameter } from "../src/database.js";
import { feedbackSchema, replySchema } from "../src/models.js";

const settings = settingsFromEnv({ GOOGLE_WEB_CLIENT_ID: "fala-test.apps.googleusercontent.com", DATABASE_URL: "postgres://local/fala" });
let pg: PGlite, db: Database;
const identities = new Map<string, GoogleIdentity>();
const contexts: Record<string, unknown>[] = [];
const correction = { key: "past", category: "grammar", said: "Ontem eu vai", natural: "Ontem eu fui", explanation: "Completed action", example: "Eu fui ontem." };
const provider = {
  demo: false,
  reply: async (context: Record<string, unknown>) => { contexts.push(context); return replySchema.parse({ text: "E depois?", practice_phrase: context.action === "help" ? "Uma mesa, por favor." : "" }); },
  feedback: async () => feedbackSchema.parse({ summary: "Boa!", corrections: [correction] }),
};
const instance = (extra = {}) => createHandler({ settings: () => ({ ...settings, ...extra }), database: () => db,
  provider: () => provider, verifyGoogle: async token => { const id = identities.get(token); if (!id) throw Error("Unexpected token"); return id; } });
async function call(path: string, method = "GET", token = "", body?: unknown, address = "test-ip", target = instance()) {
  const response = await target(new Request(`https://fala.test${path}`, { method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), address);
  return { status: response.status, data: await response.json() };
}
async function challenge(address = randomUUID()) { return (await call("/auth/google/challenge", "POST", "", {}, address)).data; }
function googleToken(subject: string, nonce: string, email = `${subject}@gmail.com`) {
  const token = randomUUID().repeat(4); identities.set(token, { subject, email, nonce }); return token;
}
async function login(subject: string, email?: string) {
  const c = await challenge();
  const result = await call("/auth/google", "POST", "", { challenge_id: c.challenge_id, id_token: googleToken(subject, c.nonce, email) }, randomUUID());
  expect(result.status).toBe(200); return result.data.token as string;
}
const start = (token: string, request_id = randomUUID(), target = instance()) => call("/sessions", "POST", token, { request_id }, "test-ip", target);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
  for (const file of ["202609180001_fala.sql", "202609180002_google_sign_in.sql"]) await pg.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  const wrap = (client: Pick<PGlite, "query">): Executor => ({ query: async <T>(sql: string, values: Parameter[] = []) => (await client.query<T>(sql, values)).rows });
  db = { ...wrap(pg), transaction: fn => pg.transaction(tx => fn(wrap(tx))), close: () => pg.close() };
}, 30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await pg.exec(`DELETE FROM fala.users WHERE id <> '${LEGACY_USER_ID}'; DELETE FROM fala.sessions;
    TRUNCATE fala.login_challenges,fala.auth_rate_limits,fala.usage_limits;`);
  identities.clear(); contexts.length = 0;
});

it("signs in arbitrary verified Google accounts, hashes device secrets, and persists sessions across instances", async () => {
  const config = await call("/auth/config");
  expect(config.data).toEqual({ google_client_id: settings.googleClientId });
  expect(settings.token).toBe("");
  const token = await login("alice", "person@example.org");
  const saved = (await db.query<{ token_hash: string }>("SELECT token_hash FROM fala.device_sessions"))[0];
  expect(saved.token_hash).toBe(hash(token)); expect(saved.token_hash).not.toContain(token);
  expect((await call("/dashboard", "GET", token)).status).toBe(200);
  expect((await call("/diagnostics", "GET", token)).status).toBe(403);
  expect((await call("/dashboard")).status).toBe(401);
  const sameUser = await login("alice", "new-address@gmail.com");
  expect((await db.query("SELECT id FROM fala.users WHERE google_subject='alice'")).length).toBe(1);
  expect((await call("/dashboard", "GET", sameUser)).status).toBe(200);
  // The same email cannot attach a different Google subject to an existing user's data.
  await login("bob", "new-address@gmail.com");
  expect((await db.query("SELECT id FROM fala.users WHERE email='new-address@gmail.com'")).length).toBe(2);
});

it("keeps prior vocabulary exposure private to each learner", async () => {
  const alice = await login("alice"), bob = await login("bob");
  const answer = { request_id: randomUUID(), text: "Abacaxi." };
  const a = (await start(alice)).data;
  await call(`/sessions/${a.id}/turns`, "POST", alice, answer);
  const b = (await start(bob)).data;
  await call(`/sessions/${b.id}/turns`, "POST", bob, answer);
  const first = (await call(`/sessions/${b.id}/finish`, "POST", bob, {})).data;
  expect(first.vocabulary.find((v: { word: string }) => v.word === "abacaxi").seen_before).toBe(false);
  const later = (await start(bob)).data;
  await call(`/sessions/${later.id}/turns`, "POST", bob, answer);
  const repeated = (await call(`/sessions/${later.id}/finish`, "POST", bob, {})).data;
  expect(repeated.vocabulary.find((v: { word: string }) => v.word === "abacaxi").seen_before).toBe(true);
});

it("scopes lesson rotation and phrase exposure to a learner's retained history", async () => {
  const alice = await login("alice"), bob = await login("bob");
  const classStart = (token: string) => call("/sessions", "POST", token, { request_id: randomUUID(), topic: "capoeira class" });
  const a = (await classStart(alice)).data;
  await call(`/sessions/${a.id}/turns`, "POST", alice, { request_id: randomUUID(), text: "Meia lua de compasso. Queda de rim." });
  const a2 = (await classStart(alice)).data;
  expect(contexts.at(-1)?.lesson).toMatchObject({ id: "instruments-v1" });
  const b = (await classStart(bob)).data;
  expect(contexts.at(-1)?.lesson).toMatchObject({ id: "kicks-v1" });
  expect(contexts.at(-1)?.recent_openings).toEqual([]);
  for (const [token, id, seen] of [[alice, a2.id, true], [bob, b.id, false]] as const) {
    await call(`/sessions/${id}/turns`, "POST", token, { request_id: randomUUID(), text: "Meia-lua de compasso. Queda de rins." });
    const report = (await call(`/sessions/${id}/finish`, "POST", token, {})).data;
    for (const phrase of ["meia-lua de compasso", "queda de rins"]) expect(report.vocabulary.find((item: { word: string }) => item.word === phrase).seen_before).toBe(seen);
  }
  await call("/learner", "DELETE", alice);
  await classStart(alice);
  expect(contexts.at(-1)?.lesson).toMatchObject({ id: "kicks-v1" });
  await classStart(bob);
  expect(contexts.at(-1)?.lesson).toMatchObject({ id: "instruments-v1" });
});

it("keeps level evidence scoped to its learner and removes it with practice history", async () => {
  const alice = await login("alice"), bob = await login("bob");
  for (let i = 0; i < 2; i++) {
    const saved = (await start(alice)).data;
    await call(`/sessions/${saved.id}/finish`, "POST", alice, {});
    await db.query("UPDATE fala.sessions SET feedback=jsonb_set(feedback,'{practice_result}',$2::text::jsonb) WHERE id=$1::uuid", [saved.id, JSON.stringify({ level: 3, ready: true, successful_answers: 6, independent_answers: 10 })]);
  }
  expect((await call("/progress", "GET", alice)).data.practice.level).toBe(4);
  expect((await call("/progress", "GET", bob)).data.practice.level).toBe(1);
  await start(bob);
  expect(contexts.at(-1)?.practice).toMatchObject({ level: 1 });
  await call("/learner", "DELETE", alice);
  expect((await call("/progress", "GET", alice)).data.practice.level).toBe(1);
});

it("does not count an unused hidden answer idea as prior vocabulary exposure", async () => {
  const token = await login("alice");
  const first = (await start(token)).data;
  await db.query("UPDATE fala.sessions SET opening=jsonb_set(opening,'{suggested_replies}',$2::text::jsonb) WHERE id=$1::uuid", [first.id, JSON.stringify([{ text: "Abacaxi", translation: "Pineapple" }])]);
  const next = (await start(token)).data;
  await call(`/sessions/${next.id}/turns`, "POST", token, { request_id: randomUUID(), text: "Abacaxi." });
  const review = (await call(`/sessions/${next.id}/finish`, "POST", token, {})).data;
  expect(review.vocabulary.find((word: { word: string }) => word.word === "abacaxi").seen_before).toBe(false);
});

it("rejects mismatched, expired, and replayed challenges, including concurrent exchanges", async () => {
  const c = await challenge();
  const saved = (await db.query<{ nonce_hash: string }>("SELECT nonce_hash FROM fala.login_challenges WHERE id=$1", [c.challenge_id]))[0];
  expect(saved.nonce_hash).toBe(hash(c.nonce));
  const exchange = (nonce: string) => call("/auth/google", "POST", "", { challenge_id: c.challenge_id, id_token: googleToken("alice", nonce) });
  expect((await exchange("wrong")).status).toBe(401);
  const results = await Promise.all([exchange(c.nonce), exchange(c.nonce)]);
  expect(results.map(r => r.status).sort()).toEqual([200,401]);
  expect((await exchange(c.nonce)).status).toBe(401);
  const expired = await challenge();
  await db.query("UPDATE fala.login_challenges SET expires_at=now()-interval '1 second'");
  expect((await call("/auth/google", "POST", "", { challenge_id: expired.challenge_id, id_token: googleToken("alice", expired.nonce) })).status).toBe(401);
});

it("isolates conversations, retries, aggregates, AI memory, updates, and all deletion routes between users", async () => {
  const alice = await login("alice"), bob = await login("bob"), requestId = randomUUID();
  const a = (await start(alice, requestId)).data, b = (await start(bob, requestId)).data;
  expect(a.id).not.toBe(b.id); expect(a.user_id).toBeUndefined();
  expect((await start(alice, requestId)).data.id).toBe(a.id);
  for (const method of ["GET", "DELETE"]) expect((await call(`/sessions/${a.id}`, method, bob)).status).toBe(404);
  for (const action of ["turns", "finish"]) {
    const body = action === "turns" ? { request_id: randomUUID(), text: "Oi" } : {};
    expect((await call(`/sessions/${a.id}/${action}`, "POST", bob, body)).status).toBe(404);
  }
  expect((await call(`/sessions/${a.id}/turns`, "POST", alice, { request_id: randomUUID(), text: correction.said, speech_ms: 6000 })).status).toBe(200);
  await call(`/sessions/${a.id}/turns`, "POST", alice, { request_id: randomUUID(), text: "A table", language: "en-US", help: true });
  await call(`/sessions/${a.id}/finish`, "POST", alice, {});
  const ap = (await call("/progress", "GET", alice)).data;
  expect(ap.memory).toHaveLength(1); expect(ap.help_patterns).toHaveLength(1); expect(ap.speech_ms).toBe(6000);
  const bp = (await call("/progress", "GET", bob)).data;
  expect(bp.memory).toEqual([]); expect(bp.help_patterns).toEqual([]); expect(bp.speech_ms).toBe(0); expect(bp.topics).toEqual([]);
  expect((await call("/sessions", "GET", bob)).data.map((s: { id: string }) => s.id)).toEqual([b.id]);
  await start(bob);
  expect(JSON.stringify(contexts.at(-1))).not.toContain(correction.natural);
  await call("/learner", "DELETE", bob);
  expect((await call("/sessions", "GET", bob)).data).toEqual([]);
  expect((await call(`/sessions/${a.id}`, "GET", alice)).status).toBe(200);
});

it("revokes individual sessions and deletes the entire account without affecting another user", async () => {
  const a1 = await login("alice"), a2 = await login("alice"), bob = await login("bob");
  const a = (await start(a1)).data, b = (await start(bob)).data;
  await call(`/sessions/${a.id}/turns`, "POST", a1, { request_id: randomUUID(), text: correction.said });
  await call(`/sessions/${a.id}/finish`, "POST", a1, {});
  expect((await call("/auth/logout", "POST", a1, {})).status).toBe(200);
  expect((await call("/dashboard", "GET", a1)).status).toBe(401);
  expect((await call("/dashboard", "GET", a2)).status).toBe(200);
  const user = (await db.query<{ id: string }>("SELECT id FROM fala.users WHERE google_subject='alice'"))[0];
  expect((await call("/account", "DELETE", a2)).status).toBe(200);
  expect((await call("/dashboard", "GET", a2)).status).toBe(401);
  for (const table of ["turns", "evidence"]) expect(await db.query(`SELECT * FROM fala.${table} WHERE session_id=$1`, [a.id])).toEqual([]);
  expect(await db.query("SELECT * FROM fala.device_sessions WHERE user_id=$1", [user.id])).toEqual([]);
  expect(await db.query("SELECT * FROM fala.users WHERE id=$1", [user.id])).toEqual([]);
  expect((await call(`/sessions/${b.id}`, "GET", bob)).status).toBe(200);
  const anew = await login("alice");
  expect((await call("/sessions", "GET", anew)).data).toEqual([]);
  await db.query("UPDATE fala.device_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [hash(anew)]);
  expect((await call("/dashboard", "GET", anew)).status).toBe(401);
});

it("applies per-user and app-wide AI budgets without making reads or account deletion unavailable", async () => {
  const a = await login("alice"), b = await login("bob");
  const target = instance({ dailyUserLimit: 1, dailyAppLimit: 3 });
  expect((await start(a, randomUUID(), target)).status).toBe(200);
  expect((await start(a, randomUUID(), target)).status).toBe(429);
  expect((await start(b, randomUUID(), target)).status).toBe(200);
  expect((await start(await login("charlie"), randomUUID(), target)).status).toBe(429);
  expect((await call("/dashboard", "GET", a)).status).toBe(200);
  expect((await call("/account", "DELETE", a)).status).toBe(200);
});

it("limits unauthenticated requests across handlers and resets old buckets", async () => {
  for (let i=0; i<10; i++) expect((await call("/auth/google/challenge", "POST", "", {}, "same-ip")).status).toBe(200);
  expect((await call("/auth/google/challenge", "POST", "", {}, "same-ip")).status).toBe(429);
  expect((await call("/auth/google/challenge", "POST", "", {}, "another-ip")).status).toBe(200);
  await db.query("UPDATE fala.auth_rate_limits SET window_start=now()-interval '3 minutes'");
  expect((await call("/auth/google/challenge", "POST", "", {}, "same-ip")).status).toBe(200);
});

it("denies public database roles all authentication and account tables", async () => {
  for (const role of ["anon", "authenticated"]) {
    await pg.exec(`SET ROLE ${role}`);
    try { for (const table of ["users", "device_sessions", "login_challenges", "auth_rate_limits", "usage_limits"]) await expect(pg.query(`SELECT * FROM fala.${table}`)).rejects.toMatchObject({ code: "42501" }); }
    finally { await pg.exec("RESET ROLE"); }
  }
});

it("cryptographically verifies Google's signature, issuer, audience, age, nonce, and verified email", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const key = { ...await exportJWK(publicKey), kid: "google-test", alg: "RS256" };
  const verify = googleVerifier(createLocalJWKSet({ keys: [key] }));
  const now = Math.floor(Date.now()/1000);
  const claims = { sub: "google-stable-id", email: "person@example.org", email_verified: true, nonce: "challenge-nonce", iat: now, exp: now+3600, iss: "https://accounts.google.com", aud: settings.googleClientId };
  const sign = (extra = {}, signer = privateKey) => new SignJWT({ ...claims, ...extra }).setProtectedHeader({ alg: "RS256", kid: "google-test" }).sign(signer);
  expect(await verify(await sign(), settings.googleClientId)).toEqual({ subject: claims.sub, email: claims.email, nonce: claims.nonce });
  for (const extra of [{ aud: "other-client" }, { iss: "https://attacker.test" }, { exp: now-1 }, { iat: now-601 }, { email_verified: false }, { nonce: "" }, { exp: undefined }, { sub: undefined }]) {
    await expect(verify(await sign(extra), settings.googleClientId)).rejects.toMatchObject({ status: 401 });
  }
  const other = await generateKeyPair("RS256");
  await expect(verify(await sign({}, other.privateKey), settings.googleClientId)).rejects.toMatchObject({ status: 401 });
});
