import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../public/app/api.js';

const limited = (seconds = 1, code = 'ai_rate_limited') => Response.json({ detail: 'Please wait.', code, retry_after_seconds: seconds }, { status: 429 });
const options = { method: 'POST', body: JSON.stringify({ request_id: 'same-answer-id', text: 'Ginga.' }) };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('automatically replays the identical answer once and reports the wait', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const request = vi.fn().mockImplementationOnce(async () => limited()).mockImplementation(async () => Response.json({ text: 'Tudo bem!' }));
  vi.stubGlobal('fetch', request);
  const waiting = vi.fn();
  const promise = apiRequest('/sessions/example/turns', options, waiting);
  await vi.advanceTimersByTimeAsync(1250);
  expect(await promise).toEqual({ text: 'Tudo bem!' });
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls.map(call => call[1].body)).toEqual([options.body, options.body]);
  expect(waiting.mock.calls).toEqual([[1], [0]]);
});

it.each(['/auth/google', '/speech/transcribe', '/sessions/example/speech', '/friends'])('does not replay unrelated operations: %s', async path => {
  const request = vi.fn(async () => limited()); vi.stubGlobal('fetch', request);
  await expect(apiRequest(path, options)).rejects.toMatchObject({ status: 429 });
  expect(request).toHaveBeenCalledTimes(1);
});

it.each([[120, 'ai_rate_limited'], [1, ''], [-1, 'ai_rate_limited']])('leaves long, unrelated or invalid limits to the user (%s, %s)', async (seconds, code) => {
  const request = vi.fn(async () => limited(seconds, code)); vi.stubGlobal('fetch', request);
  await expect(apiRequest('/sessions', options)).rejects.toMatchObject({ status: 429 });
  expect(request).toHaveBeenCalledTimes(1);
});

it('does not loop if the second response is still throttled', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const request = vi.fn(async () => limited()); vi.stubGlobal('fetch', request);
  const assertion = expect(apiRequest('/sessions', options)).rejects.toMatchObject({ status: 429 });
  await vi.advanceTimersByTimeAsync(1250); await assertion;
  expect(request).toHaveBeenCalledTimes(2);
});

it('requires a request ID before replaying a new session', async () => {
  const request = vi.fn(async () => limited()); vi.stubGlobal('fetch', request);
  await expect(apiRequest('/sessions', { method: 'POST', body: '{}' })).rejects.toMatchObject({ status: 429 });
  expect(request).toHaveBeenCalledTimes(1);
});
