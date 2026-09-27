// Real session pipeline, dedicated synthetic accounts, operator-only adapter.
// Generated text is used transiently to choose a suggested reply, never logged.
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { percentile } from './lib/latency.mjs';
const url = new URL(process.env.FALA_URL || 'https://invalid.invalid');
const token = process.env.FALA_TOKEN, manifest = process.env.FALA_SESSION_FIXTURE;
const gap = Number(process.env.FALA_SESSION_GAP_MS || 35000);
if (process.env.FALA_RUN_SESSION_CHECK !== 'true' || !token || !manifest
  || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
  || !(/^fala-latency-probe-[a-z0-9-]+\.vercel\.app$/.test(url.hostname) || url.hostname === 'fala-api.vercel.app')
  || !/^artifacts\/session-fixtures-[0-9a-f-]{36}\.json$/.test(manifest)
  || !Number.isInteger(gap) || gap < 0 || gap > 60000) throw Error('Use an authorized isolated Vercel probe, its private fixture manifest, and explicit session-check opt-in.');
const fixture = JSON.parse(await readFile(manifest, 'utf8'));
if (fixture.schema !== 'fala_latency_probe' || !Array.isArray(fixture.actors) || !fixture.actors.length || fixture.actors.length > 50
  || fixture.actors.some(actor => !/^fala_[A-Za-z0-9_-]{43}$/.test(actor.token))) throw Error('Invalid synthetic fixture.');
if (fixture.actors.length > 5 && gap < 35000) throw Error('Use at least 35 seconds between 50-learner waves for this bounded provider-capacity check.');
const actors = fixture.actors.map(actor => ({ ...actor, session: null, reply: null, failed: false, completed: false }));
const samples = [], failures = [];
const startedAt = new Date().toISOString();
function summary(rows) {
  return { requests: rows.length, successful: rows.filter(row => row.ok).length,
    below_3_seconds: rows.filter(row => row.ok && row.total_ms < 3000).length,
    metrics: Object.fromEntries(['total_ms','handler_ms','ai_ms','db_ms','outside_handler_ms'].map(key => [key,
      { p50: percentile(rows.map(row => row[key]), .5), p95: percentile(rows.map(row => row[key]), .95), max: percentile(rows.map(row => row[key]), 1) }])) };
}
async function request(actor, index, phase, path, method = 'GET', body, expected = 200) {
  const start = performance.now();
  const row = { index, phase, status: 0, ok: false };
  try {
    const response = await fetch(new URL('/diagnostics/session', url), { method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'X-Fala-Test-Learner': actor.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, method, ...(body === undefined ? {} : { body }) }), signal: AbortSignal.timeout(35000) });
    row.status = response.status;
    const data = await response.json();
    const timing = Object.fromEntries((response.headers.get('server-timing') || '').split(',').map(part => part.trim().match(/^([a-z_]+);dur=([\d.]+)$/)).filter(Boolean).map(match => [match[1], Number(match[2])]));
    row.handler_ms = timing.total ?? null; row.ai_ms = timing.ai ?? 0; row.db_ms = timing.db ?? 0;
    row.input_tokens = Number(response.headers.get('x-fala-probe-input-tokens') || 0);
    row.output_tokens = Number(response.headers.get('x-fala-probe-output-tokens') || 0);
    row.ai_calls = Number(response.headers.get('x-fala-probe-ai-calls') || 0);
    row.error_code = typeof data?.code === 'string' && /^ai_[a-z_]+$/.test(data.code) ? data.code : null;
    const runtime = JSON.parse(response.headers.get('x-fala-probe-runtime') || '{}');
    row.instance_id = /^[0-9a-f-]{36}$/.test(runtime.instance_id || '') ? runtime.instance_id : null;
    row.invocation_number = Number.isSafeInteger(runtime.invocation_number) ? runtime.invocation_number : null;
    row.ok = response.status === expected && response.headers.get('x-fala-probe-mode') === 'isolated-session';
    if (!row.ok) { row.error = `http_${response.status}`; throw Error(row.error); }
    return data;
  } catch {
    row.error ||= 'connection_or_response_failed';
    throw Error(row.error);
  } finally {
    row.total_ms = Math.round((performance.now() - start) * 10) / 10;
    row.outside_handler_ms = row.handler_ms == null ? null : Math.round((row.total_ms - row.handler_ms) * 10) / 10;
    samples.push(row);
  }
}
async function wave(phase, action) {
  await Promise.all(actors.map(async (actor, index) => {
    if (actor.failed) return;
    try { await action(actor, index); }
    catch (error) { actor.failed = true; failures.push({ index, phase, reason: /^(invalid_session|missing_suggestion|retry_changed|wrong_turn_count|review_too_long|http_\d+|connection_or_response_failed)$/.test(error.message) ? error.message : 'check_failed' }); }
  }));
  console.log(JSON.stringify({ phase, ...summary(samples.filter(row => row.phase === phase)), failed_actors: actors.filter(actor => actor.failed).length }));
}
try {
  await wave('start', async (actor, index) => {
    const data = await request(actor, index, 'start', '/sessions', 'POST', { request_id: randomUUID(), kind: 'conversation',
      topic: 'capoeira class', support_language: 'he-IL', practice_level: actor.level });
    if (!data.id || !data.opening) throw Error('invalid_session');
    actor.session = data.id; actor.reply = data.opening;
  });
  await wave('isolation', async (actor, index) => {
    const other = actors.find(candidate => candidate !== actor && candidate.session);
    if (other) await request(actor, index, 'isolation', `/sessions/${other.session}`, 'GET', undefined, 404);
  });
  for (let turn = 1; turn <= 10 && actors.some(actor => !actor.failed); turn++) {
    if (gap) await new Promise(resolve => setTimeout(resolve, gap));
    await wave(`turn_${turn}`, async (actor, index) => {
      const text = actor.reply.suggested_replies?.[(turn + index) % 2]?.text;
      if (!text) throw Error('missing_suggestion');
      const body = { request_id: randomUUID(), text, language: 'pt-BR', source: 'typed', speech_ms: 0, assisted: true };
      actor.reply = await request(actor, index, `turn_${turn}`, `/sessions/${actor.session}/turns`, 'POST', body);
      if (turn === 1) {
        const replay = await request(actor, index, 'retry', `/sessions/${actor.session}/turns`, 'POST', body);
        if (!isDeepStrictEqual(replay, actor.reply)) throw Error('retry_changed');
      }
    });
  }
  if (gap && actors.some(actor => !actor.failed)) await new Promise(resolve => setTimeout(resolve, gap));
  await wave('finish', async (actor, index) => {
    const saved = await request(actor, index, 'read', `/sessions/${actor.session}`);
    if (saved.turns.length !== 10) throw Error('wrong_turn_count');
    const result = await request(actor, index, 'finish', `/sessions/${actor.session}/finish`, 'POST', {});
    if (result.vocabulary.length > 5) throw Error('review_too_long');
    actor.completed = true;
  });
} finally {
  for (const [index, actor] of actors.entries()) if (actor.session) {
    try { await request(actor, index, 'cleanup', `/sessions/${actor.session}`, 'DELETE'); }
    catch { failures.push({ index, phase: 'cleanup' }); }
  }
  const file = `artifacts/hosted-sessions-${actors.length}-${Date.now()}.json`;
  const report = { started_at: startedAt, finished_at: new Date().toISOString(), host: url.hostname,
    learners: actors.length, completed: actors.filter(actor => actor.completed).length, gap_ms: gap,
    note: 'Real API/SQL/AI with isolated synthetic accounts and assisted typed replies. No real learner history, microphone, transcription or playback. Deliberately spaced waves are not a sustained fast-turn capacity guarantee.',
    summary: summary(samples.filter(row => /^(start|turn_\d+|finish)$/.test(row.phase))), failures, samples };
  await writeFile(file, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: file, completed: report.completed, learners: actors.length, summary: report.summary, failures }));
  if (failures.length || report.completed !== actors.length) process.exitCode = 1;
  else if (report.summary.metrics.total_ms.p95 > 3000) process.exitCode = 2;
}
