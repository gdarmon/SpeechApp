import http from 'node:http';
import https from 'node:https';

export function parseServerTiming(header = '') {
  const timings = {};
  for (const metric of header.split(',')) {
    const match = metric.trim().match(/^([\w-]+)\s*;\s*dur=([\d.]+)(?:\s*;.*)?$/);
    if (match && Number.isFinite(Number(match[2]))) timings[match[1]] = Number(match[2]);
  }
  return timings;
}

const rounded = value => Number(value.toFixed(1));
export function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] : null;
}

// The residual is NOT a measurement of cold start or platform queue time.
// It also includes travel to/from the function and work before our handler.
export function summarize(samples) {
  const ok = samples.filter(sample => sample.status === 200 && !sample.error);
  const metrics = ['total_ms', 'client_queue_ms', 'dns_ms', 'tcp_ms', 'tls_ms',
    'after_connection_ms', 'body_ms', 'handler_ms', 'ai_ms', 'db_ms', 'outside_handler_ms'];
  return { requests: samples.length, successful: ok.length,
    below_3_seconds: ok.filter(sample => sample.total_ms < 3000).length,
    metrics: Object.fromEntries(metrics.map(metric => [metric, {
      samples: ok.filter(sample => Number.isFinite(sample[metric])).length,
      p50: percentile(ok.map(sample => sample[metric]), .5),
      p95: percentile(ok.map(sample => sample[metric]), .95),
      max: percentile(ok.map(sample => sample[metric]), 1),
    }])), errors: samples.filter(sample => sample.status !== 200 || sample.error)
      .map(({ status, error, total_ms }) => ({ status, error, total_ms })) };
}

export function meetsLatencyTarget(summary, maxP95Ms = 3000) {
  return summary.requests > 0 && summary.successful === summary.requests
    && summary.metrics.total_ms.p95 !== null && summary.metrics.total_ms.p95 < maxP95Ms;
}

export function correlatePlatform(samples, logs) {
  const reports = new Map(logs.filter(log => log.type === 'report' && log.netlify_request_id)
    .map(log => [log.netlify_request_id, log]));
  return samples.map(sample => {
    const log = reports.get(sample.request_id);
    const duration = log?.message?.match(/\bDuration: ([\d.]+) ms/);
    const platformMs = duration ? Number(duration[1]) : null;
    return { wave: sample.wave, index: sample.index, request_id: sample.request_id, matched: Boolean(log),
      total_ms: sample.total_ms, handler_ms: sample.handler_ms, ai_ms: sample.ai_ms,
      platform_duration_ms: platformMs,
      platform_minus_handler_ms: Number.isFinite(platformMs) && Number.isFinite(sample.handler_ms)
        ? rounded(platformMs - sample.handler_ms) : null,
      // Different clocks: supporting evidence, not a precisely synchronized queue timer.
      platform_timestamp_offset_ms: Number.isFinite(log?.ts) ? log.ts - Date.parse(sample.started_at) : null };
  });
}

// No redirects, retries, arbitrary returned text or credential logging.
// Body is returned separately for the caller to validate and then discard.
export function measureRequest(url, { agent, token, body, timeoutMs = 20000 } = {}) {
  const start = performance.now();
  const startedAt = new Date().toISOString();
  const marks = {};
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise(resolve => {
    let settled = false, bytes = 0, status = 0, reused = false, requestId = null, server = {};
    let timer;
    const finish = (error, text) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const end = performance.now() - start;
      const duration = (to, from = 0) => Number.isFinite(to) && Number.isFinite(from) ? rounded(to - from) : null;
      const ready = marks.secure ?? marks.connect ?? marks.socket;
      resolve({ sample: { started_at: startedAt, status, error, request_id: requestId, reused_socket: reused,
        bytes, total_ms: rounded(end), client_queue_ms: duration(marks.socket),
        dns_ms: duration(marks.lookup, marks.socket),
        tcp_ms: duration(marks.connect, marks.lookup ?? marks.socket),
        tls_ms: duration(marks.secure, marks.connect),
        after_connection_ms: duration(marks.headers, ready), body_ms: duration(end, marks.headers),
        handler_ms: server.total ?? null, ai_ms: server.ai ?? null, db_ms: server.db ?? null,
        outside_handler_ms: Number.isFinite(server.total) ? rounded(end - server.total) : null,
        server_timing: server }, text });
    };
    const req = transport.request(url, {
      agent, method: body === undefined ? 'GET' : 'POST',
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }) },
    }, res => {
      marks.headers = performance.now() - start;
      status = res.statusCode;
      requestId = res.headers['x-nf-request-id'] ?? null;
      server = parseServerTiming(res.headers['server-timing']);
      const chunks = [];
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 1000000) { finish('response_too_large'); req.destroy(); return; }
        chunks.push(chunk);
      });
      res.on('end', () => finish(null, Buffer.concat(chunks).toString('utf8')));
      res.on('error', () => finish('response_interrupted'));
    });
    req.on('socket', socket => {
      marks.socket = performance.now() - start;
      reused = req.reusedSocket;
      if (!socket.connecting) return;
      socket.once('lookup', () => { marks.lookup = performance.now() - start; });
      socket.once('connect', () => { marks.connect = performance.now() - start; });
      socket.once('secureConnect', () => { marks.secure = performance.now() - start; });
    });
    req.on('error', () => finish('connection_failed'));
    timer = setTimeout(() => { finish('deadline_exceeded'); req.destroy(); }, timeoutMs);
    req.end(body);
  });
}
