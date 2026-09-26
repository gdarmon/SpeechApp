// Provider recovery happens on the server. Never add a second, client-side
// quota wait; keep the caller's exact request ID/body for an explicit Retry.
export async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', ...options,
      signal: AbortSignal.timeout(20000) });
  } catch { throw new Error('The connection was interrupted. Your answer is still here. Try again when you’re online.'); }
  if (response.ok) return options.audio ? response.arrayBuffer() : response.json();
  const error = await response.json().catch(() => ({}));
  const failure = new Error(error.code === 'ai_rate_limited'
    ? "We couldn't get a reply. Your answer is still here. Please try again."
    : error.detail || 'Fala is unavailable. Please try again.');
  failure.status = response.status;
  throw failure;
}
