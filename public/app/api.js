// Retry only a provider throttle on an idempotent conversation operation.
// Reuse its exact body/request ID; never replay sign-in, audio or other mutations.
export async function apiRequest(path, options = {}, onWait = () => {}) {
  const started = Date.now();
  let body;
  try { body = JSON.parse(options.body); } catch { /* GET and non-JSON requests aren't replayable. */ }
  const replaySafe = options.method === 'POST' && (Boolean(body?.request_id)
    && (path === '/sessions' || /^\/sessions\/[^/]+\/turns$/.test(path)) || /^\/sessions\/[^/]+\/finish$/.test(path));
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', ...options,
        signal: AbortSignal.timeout(Math.max(1, Math.min(55000, 90000 - (Date.now() - started)))) });
    } catch { throw new Error('The connection was interrupted. Your answer is still here. Try again when you’re online.'); }
    if (response.ok) return options.audio ? response.arrayBuffer() : response.json();
    const error = await response.json().catch(() => ({}));
    const seconds = error.retry_after_seconds;
    if (replaySafe && attempt === 0 && response.status === 429 && error.code === 'ai_rate_limited'
      && Number.isInteger(seconds) && seconds > 0 && seconds <= 30 && Date.now() - started + seconds * 1000 < 60000) {
      onWait(seconds);
      await new Promise(resolve => setTimeout(resolve, seconds * 1000 + 250));
      onWait(0);
      continue;
    }
    const failure = new Error(error.detail || 'Fala is unavailable. Please try again.');
    failure.status = response.status;
    throw failure;
  }
}
