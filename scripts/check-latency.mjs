// Bounded production diagnosis; no learner history, session writes, or raw text.
import https from 'node:https';
import { mkdir, writeFile } from 'node:fs/promises';
import { measureRequest, summarize, meetsLatencyTarget } from './lib/latency.mjs';
import { openHttp2Session, measureHttp2Request } from './lib/latency-http2.mjs';

const url = new URL(process.env.FALA_URL || 'https://falachatapp.netlify.app');
const target = process.env.FALA_LATENCY_TARGET || 'health';
const concurrency = Number(process.env.FALA_LATENCY_CONCURRENCY || 1);
const waves = Number(process.env.FALA_LATENCY_WAVES || 3);
const route = process.env.FALA_PROBE_ROUTE || 'primary';
const token = process.env.FALA_TOKEN;
const maxP95Ms = Number(process.env.FALA_LATENCY_MAX_P95_MS || 3000);
const transport = process.env.FALA_LATENCY_TRANSPORT || 'http1';
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
  || !['health', 'diagnostics', 'ai'].includes(target)
  || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 50
  || !Number.isInteger(waves) || waves < 1 || waves > 3 || concurrency * waves > 100
  || !['active', 'primary', 'fallback'].includes(route)
  || !Number.isFinite(maxP95Ms) || maxP95Ms <= 0
  || !['http1', 'http2'].includes(transport)
  || (target !== 'health' && !token)
  || (target === 'ai' && process.env.FALA_RUN_AI_PROBE !== 'true')) {
  throw Error('Use an HTTPS site, health/diagnostics/ai, 1–50 concurrent requests, 1–3 waves (at most 100 requests), and an authorized operator token. AI also requires FALA_RUN_AI_PROBE=true.');
}

const path = target === 'ai' ? '/diagnostics/ai' : `/${target}`;
const agent = new https.Agent({ keepAlive: true, maxSockets: concurrency, maxFreeSockets: concurrency });
const results = [];
const summaries = [];
const startedAt = new Date().toISOString();
const h2 = transport === 'http2' ? await openHttp2Session(url.origin) : null;
try {
  for (let wave = 0; wave < waves; wave++) {
    const samples = await Promise.all(Array.from({ length: concurrency }, async (_, index) => {
      const measure = h2 ? measureHttp2Request : measureRequest;
      const { sample, text } = await measure(new URL(path, url), { agent, session: h2?.session,
        token: target === 'health' ? undefined : token,
        ...(target === 'ai' ? { body: JSON.stringify({ route }) } : {}) });
      let data;
      try { data = JSON.parse(text); } catch { if (!sample.error) sample.error = 'invalid_json'; }
      if (sample.status === 200 && (target === 'ai' ? data?.synthetic !== true
        : target === 'health' ? data?.status !== 'ok' : data?.database_ready !== true)) sample.error = 'invalid_probe_response';
      // Only the fixed operator endpoint supplies these observations; no text is retained.
      const observations = (data?.observations || []).map(({ provider, model, status, elapsed_ms, limits, input_tokens, output_tokens }) =>
        ({ provider, model, status, elapsed_ms, limits, input_tokens, output_tokens }));
      return { wave: wave + 1, index, ...sample, ...(target === 'ai' ? { observations } : {}) };
    }));
    results.push(...samples);
    const summary = { wave: wave + 1, ...summarize(samples) };
    summary.latency_target_met = meetsLatencyTarget(summary, maxP95Ms);
    summaries.push(summary);
    console.log(JSON.stringify(summary));
  }
} finally { agent.destroy(); h2?.session.destroy(); }
await mkdir('artifacts', { recursive: true });
const file = `artifacts/latency-${target}-${concurrency}-${Date.now()}.json`;
await writeFile(file, JSON.stringify({ started_at: startedAt, finished_at: new Date().toISOString(), host: url.hostname,
  target, route: target === 'ai' ? route : null, concurrency, waves, max_p95_ms: maxP95Ms,
  transport: h2 ? 'HTTP/2 established connection (setup excluded from waves)' : 'node:https HTTP/1.1 keep-alive',
  ...(h2 ? { connection_setup_ms: h2.connection_setup_ms, max_concurrent_streams: h2.max_concurrent_streams } : {}),
  note: 'Wave 1 is a new client connection, not proof of a cold function. Outside-handler time includes network, initialization and platform scheduling.',
  summaries, results }, null, 2) + '\n');
console.log(JSON.stringify({ report: file }));
if (results.some(sample => sample.status !== 200 || sample.error)) process.exitCode = 1;
else if (summaries.some(summary => !summary.latency_target_met)) process.exitCode = 2;
