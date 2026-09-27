// Synthetic audio through the same authenticated API used by the website.
// No physical microphone, private learner text, recordings or credentials are saved.
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const base = new URL(process.env.FALA_URL || 'https://invalid.invalid');
const manifest = process.env.FALA_SESSION_FIXTURE, token = process.env.FALA_TOKEN;
if (process.env.FALA_RUN_AUDIO_CHECK !== 'true' || !token || base.protocol !== 'https:'
  || !(/^fala-latency-probe-[a-z0-9-]+\.vercel\.app$/.test(base.hostname) || base.hostname === 'fala-api.vercel.app')
  || base.username || base.password || base.search || base.hash
  || !/^artifacts\/session-fixtures-[0-9a-f-]{36}\.json$/.test(manifest || '')) throw Error('Explicit audio opt-in and an isolated probe fixture are required.');
const fixture = JSON.parse(await readFile(manifest, 'utf8'));
if (fixture.schema !== 'fala_latency_probe' || !/^fala_[A-Za-z0-9_-]{43}$/.test(fixture.actors?.[0]?.token || '')) throw Error('Invalid synthetic fixture.');
const samples = [], started_at = new Date().toISOString();
async function request(phase, path, body, method = 'POST') {
  const start = performance.now();
  const response = await fetch(new URL('/diagnostics/session', base), { method: 'POST', redirect: 'error',
    headers: { Authorization: `Bearer ${token}`, 'X-Fala-Test-Learner': fixture.actors[0].token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, path, body }), signal: AbortSignal.timeout(35000) });
  const data = response.headers.get('content-type')?.startsWith('audio/') ? Buffer.from(await response.arrayBuffer()) : await response.json();
  const row = { phase, status: response.status, total_ms: Math.round((performance.now() - start) * 10) / 10 };
  samples.push(row); console.log(JSON.stringify(row));
  if (!response.ok || response.headers.get('x-fala-probe-mode') !== 'isolated-session') throw Error(`http_${response.status}`);
  return data;
}
let session, failure;
try {
  session = await request('start', '/sessions', { request_id: randomUUID(), kind: 'conversation', topic: 'capoeira class', practice_level: 1, support_language: 'he-IL' });
  const audio = await request('generate_synthetic_audio', `/sessions/${session.id}/speech`, { turn_id: null, suggestion_index: 0 });
  if (!Buffer.isBuffer(audio) || audio.length < 128) throw Error('invalid_audio');
  const transcript = await request('transcribe', '/speech/transcribe', { mp3_base64: audio.toString('base64') });
  if (typeof transcript.text !== 'string' || !transcript.text.trim()) throw Error('empty_transcript');
  await request('send', `/sessions/${session.id}/turns`, { request_id: randomUUID(), text: transcript.text, source: 'speech', speech_ms: 0, assisted: true, language: 'pt-BR' });
} catch (error) { failure = /^(http_\d+|invalid_audio|empty_transcript)$/.test(error.message) ? error.message : 'connection_or_response_failed'; }
finally {
  if (session?.id) try { await request('cleanup', `/sessions/${session.id}`, {}, 'DELETE'); } catch { failure ||= 'cleanup_failed'; }
  const file = `artifacts/hosted-audio-${Date.now()}.json`;
  const report = { started_at, finished_at: new Date().toISOString(), host: base.hostname, samples, failure: failure || null,
    note: 'One synthetic generated Portuguese recording, transmitted over the real web transcription/send API. Does not measure a phone microphone, Android recognition, real learner speech or physical playback.' };
  await writeFile(file, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: file, failure: report.failure }));
  if (failure) process.exitCode = 1;
}
