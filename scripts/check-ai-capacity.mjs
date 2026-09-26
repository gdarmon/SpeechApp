// Explicitly opt-in: invokes real, billable AI with fixed synthetic data only.
import { mkdir, writeFile } from 'node:fs/promises';
const url = new URL(process.env.FALA_URL || 'https://falachatapp.netlify.app');
const token = process.env.FALA_TOKEN;
const concurrency = Number(process.env.FALA_PROBE_CONCURRENCY || 1);
const route = process.env.FALA_PROBE_ROUTE || 'active';
if (process.env.FALA_RUN_AI_PROBE !== 'true' || !token || url.protocol !== 'https:' || url.username || url.password
  || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 50 || !['active', 'primary', 'fallback'].includes(route)) {
  throw Error('Explicitly enable the probe, configure the authorized HTTPS site/operator token, and choose 1–50 requests and active/primary/fallback.');
}
const results = await Promise.all(Array.from({ length: concurrency }, async (_, index) => {
  const start = performance.now();
  try {
    const response = await fetch(new URL('/diagnostics/ai', url), { method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ route }), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    return { index, status: response.status, elapsed_ms: Math.round(performance.now() - start),
      timing: response.headers.get('server-timing'), ...(response.ok
        ? { reply: data.reply, observations: data.observations } : { code: data.code || 'request_failed' }) };
  } catch { return { index, status: 0, elapsed_ms: Math.round(performance.now() - start), code: 'connection_failed' }; }
}));
const times = results.map(item => item.elapsed_ms).sort((a, b) => a - b);
const percentile = fraction => times[Math.max(0, Math.ceil(times.length * fraction) - 1)];
const summary = { at: new Date().toISOString(), host: url.hostname, route, concurrency,
  successful: results.filter(item => item.status === 200).length,
  within_3_seconds: results.filter(item => item.status === 200 && item.elapsed_ms < 3000).length,
  p50_ms: percentile(.5), p95_ms: percentile(.95), max_ms: times.at(-1),
  capacity: results.flatMap(item => item.observations || []).map(({ provider, model, limits, input_tokens, output_tokens }) =>
    ({ provider, model, limits, input_tokens, output_tokens })) };
await mkdir('artifacts', { recursive: true });
const file = `artifacts/ai-capacity-${route}-${concurrency}-${Date.now()}.json`;
await writeFile(file, JSON.stringify({ summary, results }, null, 2) + '\n');
console.log(JSON.stringify({ ...summary, capacity: summary.capacity.slice(0, 3), transcript: file }, null, 2));
if (summary.successful !== concurrency) process.exitCode = 1;
