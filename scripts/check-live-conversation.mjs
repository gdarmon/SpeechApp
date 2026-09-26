// Opt-in check for a dedicated test-only learner account. Normal session APIs
// personalize replies from that account's history and retain aggregate rewards.
// Never use the operator token or a real learner's account for this check.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const url = new URL(process.env.FALA_URL || 'https://falachatapp.netlify.app');
const token = process.env.FALA_TEST_ACCOUNT_TOKEN;
if (process.env.FALA_RUN_CONVERSATION_CHECK !== 'true' || !token || url.protocol !== 'https:' || url.username || url.password) {
  throw Error('Explicitly enable the live conversation check and configure the authorized HTTPS site and dedicated test-only learner token.');
}
if (token === process.env.FALA_TOKEN) throw Error('Use a dedicated test-only learner account, not the operator credential.');
const samples = [];
async function request(path, method, body) {
  const started = performance.now();
  const response = await fetch(new URL(path, url), { method, redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  samples.push({ path: path.replace(/[0-9a-f-]{36}/g, ':synthetic-session'), method, status: response.status,
    elapsed_ms: Math.round(performance.now() - started), timing: response.headers.get('server-timing') });
  if (!response.ok) throw Error(`Synthetic request failed (HTTP ${response.status}, ${data.code || 'request_failed'}).`);
  return data;
}
const sessions = [], cleanup = [];
let failed = false;
for (const level of [1, 3]) {
  let id;
  const exchanges = [];
  try {
    const session = await request('/sessions', 'POST', { request_id: randomUUID(), kind: 'conversation', topic: 'capoeira class',
      support_language: 'he-IL', practice_level: level });
    id = session.id;
    let reply = session.opening;
    exchanges.push({ reply });
    for (let turn = 1; turn <= 10; turn++) {
      const answer = reply.suggested_replies[turn % 2].text;
      const input = { request_id: randomUUID(), text: answer, language: 'pt-BR', source: 'typed', speech_ms: 0, assisted: true, help: false };
      reply = await request(`/sessions/${id}/turns`, 'POST', input);
      exchanges.push({ answer, reply });
      if (turn === 1) {
        const repeated = await request(`/sessions/${id}/turns`, 'POST', input);
        if (JSON.stringify(reply) !== JSON.stringify(repeated)) throw Error('Retry returned a different saved reply.');
      }
    }
    const saved = await request(`/sessions/${id}`, 'GET');
    if (saved.turns.length !== 10) throw Error('Expected exactly ten saved synthetic answers.');
    const review = await request(`/sessions/${id}/finish`, 'POST', {});
    if (review.vocabulary.length > 5) throw Error('The vocabulary review exceeded five items.');
    sessions.push({ level, completed: true, exchanges, review });
  } catch (error) {
    sessions.push({ level, completed: false, error: error.message, exchanges });
    failed = true;
  } finally {
    if (id) {
      try { await request(`/sessions/${id}`, 'DELETE'); cleanup.push({ id, deleted: true }); }
      catch { cleanup.push({ id, deleted: false }); failed = true; }
    }
  }
  if (failed) break;
}
await mkdir('artifacts', { recursive: true });
const file = `artifacts/live-conversation-${Date.now()}.json`;
await writeFile(file, JSON.stringify({ at: new Date().toISOString(), samples, sessions, cleanup }, null, 2) + '\n');
console.log(JSON.stringify({ completed_levels: sessions.filter(item => item.completed).map(item => item.level),
  cleanup, samples, transcript: file }, null, 2));
if (failed) process.exitCode = 1;
