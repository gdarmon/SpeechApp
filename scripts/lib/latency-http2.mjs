import http2 from 'node:http2';
import { parseServerTiming } from './latency.mjs';

export async function openHttp2Session(origin, timeoutMs = 20000) {
  const start = performance.now();
  const session = http2.connect(origin);
  // Keep a session error from becoming an unhandled exception after setup.
  session.on('error', () => {});
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { session.destroy(); reject(Error('HTTP/2 connection deadline exceeded.')); }, timeoutMs);
    const done = error => {
      clearTimeout(timer);
      session.off('error', failed); session.off('remoteSettings', ready);
      if (error) { session.destroy(); reject(Error('HTTP/2 connection failed.')); } else resolve();
    };
    const failed = error => done(error), ready = () => done();
    session.once('error', failed); session.once('remoteSettings', ready);
  });
  return { session, connection_setup_ms: Math.round(performance.now() - start),
    max_concurrent_streams: session.remoteSettings.maxConcurrentStreams };
}

// Connection setup is reported once by openHttp2Session, outside the waves.
// Stream IDs/ready expose local stream queuing; the peer's stream limit is also reported.
export function measureHttp2Request(url, { session, token, body, timeoutMs = 20000 } = {}) {
  const start = performance.now(), startedAt = new Date().toISOString();
  return new Promise(resolve => {
    let readyAt, headersAt, status = 0, server = {}, requestId = null, bytes = 0, settled = false, timer, stream;
    const chunks = [];
    const finish = error => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      const total = performance.now() - start;
      const round = value => Number(value.toFixed(1));
      resolve({ sample: { started_at: startedAt, status, error, request_id: requestId, reused_socket: true,
        bytes, total_ms: round(total), client_queue_ms: readyAt === undefined ? null : round(readyAt),
        dns_ms: null, tcp_ms: null, tls_ms: null,
        after_connection_ms: headersAt === undefined || readyAt === undefined ? null : round(headersAt - readyAt),
        body_ms: headersAt === undefined ? null : round(total - headersAt),
        handler_ms: server.total ?? null, ai_ms: server.ai ?? null, db_ms: server.db ?? null,
        outside_handler_ms: Number.isFinite(server.total) ? round(total - server.total) : null,
        server_timing: server }, text: Buffer.concat(chunks).toString('utf8') });
    };
    try {
      stream = session.request({ ':method': body === undefined ? 'GET' : 'POST', ':path': url.pathname + url.search,
        Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) });
    } catch { finish('connection_failed'); return; }
    if (stream.id !== undefined) readyAt = performance.now() - start;
    else stream.once('ready', () => { readyAt = performance.now() - start; });
    stream.on('response', headers => {
      headersAt = performance.now() - start; status = headers[':status'];
      server = parseServerTiming(headers['server-timing']); requestId = headers['x-nf-request-id'] ?? null;
    });
    stream.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 1000000) { finish('response_too_large'); stream.close(http2.constants.NGHTTP2_CANCEL); return; }
      chunks.push(chunk);
    });
    stream.on('end', () => finish(null));
    stream.on('error', () => finish('connection_failed'));
    stream.on('close', () => finish('response_interrupted'));
    timer = setTimeout(() => { finish('deadline_exceeded'); stream.close(http2.constants.NGHTTP2_CANCEL); }, timeoutMs);
    stream.end(body);
  });
}
