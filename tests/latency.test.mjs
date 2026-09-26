import { afterEach, expect, it } from 'vitest';
import http from 'node:http';
import http2 from 'node:http2';
import { correlatePlatform, measureRequest, parseServerTiming, summarize, meetsLatencyTarget } from '../scripts/lib/latency.mjs';
import { openHttp2Session, measureHttp2Request } from '../scripts/lib/latency-http2.mjs';

const cleanup = [];
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); });
async function fixture(handler, maxSockets = 1) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  cleanup.push(() => new Promise(resolve => server.close(resolve)));
  const agent = new http.Agent({ keepAlive: true, maxSockets, maxFreeSockets: maxSockets });
  cleanup.push(() => agent.destroy());
  return { url: new URL(`http://127.0.0.1:${server.address().port}`), agent };
}

it('separates client connection-pool queuing from handler duration and reuses the connection', async () => {
  const { url, agent } = await fixture((req, res) => {
    setTimeout(() => { res.setHeader('Server-Timing', 'total;dur=80, ai;dur=60, db;dur=3'); res.end('{}'); }, 80);
  });
  const [first, second] = await Promise.all([measureRequest(url, { agent }), measureRequest(url, { agent })]);
  expect(first.sample.status).toBe(200);
  expect(second.sample.client_queue_ms).toBeGreaterThan(60);
  expect(second.sample.handler_ms).toBe(80);
  expect(second.sample.outside_handler_ms).toBeGreaterThan(60);
  const warm = await measureRequest(url, { agent });
  expect(warm.sample.reused_socket).toBe(true);
  expect(warm.sample.tcp_ms).toBeNull();
});

it('measures body download separately from waiting for response headers', async () => {
  const { url, agent } = await fixture((req, res) => {
    res.writeHead(200, { 'Server-Timing': 'total;dur=0.1' });
    res.flushHeaders();
    setTimeout(() => res.end('{}'), 80);
  });
  const { sample } = await measureRequest(url, { agent });
  expect(sample.body_ms).toBeGreaterThan(60);
  expect(sample.handler_ms).toBe(.1);
});

it('does not follow redirects or expose an authorization token in diagnostics', async () => {
  let requests = 0;
  const { url, agent } = await fixture((req, res) => {
    requests++;
    res.writeHead(302, { Location: '/other' }); res.end('{}');
  });
  const result = await measureRequest(url, { agent, token: 'secret-sentinel' });
  expect(result.sample.status).toBe(302);
  expect(requests).toBe(1);
  expect(JSON.stringify(result.sample)).not.toContain('secret-sentinel');
});

it('bounds stalled requests and includes failures instead of counting them as fast successes', async () => {
  const { url, agent } = await fixture(() => {});
  const { sample } = await measureRequest(url, { agent, timeoutMs: 50 });
  expect(sample.error).toBe('deadline_exceeded');
  const report = summarize([sample, { status: 200, error: null, total_ms: 3500 }]);
  expect(report.successful).toBe(1);
  expect(report.below_3_seconds).toBe(0);
  expect(report.metrics.total_ms.p50).toBe(3500);
  expect(report.metrics.ai_ms.p50).toBeNull();
  expect(report.errors).toHaveLength(1);
});

it('keeps overlapping AI and handler spans distinct; missing timings are unknown', () => {
  expect(parseServerTiming('db;dur=20, ai_primary;dur=1500, ai;dur=1502, total;dur=1600'))
    .toEqual({ db: 20, ai_primary: 1500, ai: 1502, total: 1600 });
  expect(parseServerTiming()).toEqual({});
});

it('fails the latency target even when every request returns HTTP 200', () => {
  const samples = [1800, 2200, 5200].map(total_ms => ({ status: 200, total_ms }));
  expect(meetsLatencyTarget(summarize(samples))).toBe(false);
  expect(meetsLatencyTarget(summarize(samples.slice(0, 2)))).toBe(true);
  expect(meetsLatencyTarget(summarize([]))).toBe(false);
  expect(meetsLatencyTarget(summarize([{ status: 503, total_ms: 100 }]))).toBe(false);
});

it('correlates hosting records by exact request ID, never by timestamp proximity', () => {
  const samples = [{ request_id: 'probe', started_at: '2026-09-26T12:00:00Z', handler_ms: 1800, total_ms: 7000 }];
  const logs = [{ type: 'report', netlify_request_id: 'unrelated', ts: Date.parse(samples[0].started_at), message: 'Duration: 100 ms' },
    { type: 'report', netlify_request_id: 'probe', ts: Date.parse(samples[0].started_at) + 5000, message: 'Duration: 1805 ms\tMemory Usage: 140 MB' }];
  expect(correlatePlatform(samples, logs)[0]).toMatchObject({ matched: true, platform_duration_ms: 1805,
    platform_minus_handler_ms: 5, platform_timestamp_offset_ms: 5000 });
  expect(correlatePlatform(samples, logs.slice(0, 1))[0]).toMatchObject({ matched: false,
    platform_duration_ms: null, platform_timestamp_offset_ms: null });
});

it('measures simultaneous HTTP/2 streams without serializing behind a connection', async () => {
  const server = http2.createServer();
  const waiting = [];
  server.on('stream', stream => {
    waiting.push(stream);
    if (waiting.length === 2) for (const reply of waiting) {
      reply.respond({ ':status': 200, 'server-timing': 'total;dur=10' }); reply.end('{}');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  cleanup.push(() => new Promise(resolve => server.close(resolve)));
  const url = new URL(`http://127.0.0.1:${server.address().port}`);
  const { session } = await openHttp2Session(url.origin);
  cleanup.push(() => session.destroy());
  const responses = await Promise.all([measureHttp2Request(url, { session }), measureHttp2Request(url, { session })]);
  for (const { sample } of responses) {
    expect(sample.status).toBe(200);
    expect(sample.error).toBeNull();
    expect(sample.handler_ms).toBe(10);
    expect(sample.client_queue_ms).not.toBeNull();
  }
});
