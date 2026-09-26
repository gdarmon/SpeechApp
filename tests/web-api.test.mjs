import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../public/app/api.js';
const options = { method: 'POST', body: JSON.stringify({ request_id: 'same-answer-id', text: 'Ginga.' }) };
afterEach(() => { vi.unstubAllGlobals(); });

it.each([1, 26, 32, 120])('returns control without a quota countdown or automatic replay (%s seconds)', async seconds => {
  const request = vi.fn(async () => Response.json({ detail: `Wait ${seconds} seconds.`, code: 'ai_rate_limited',
    retry_after_seconds: seconds }, { status: 429 }));
  vi.stubGlobal('fetch', request);
  await expect(apiRequest('/sessions/example/turns', options)).rejects.toMatchObject({
    status: 429, message: "We couldn't get a reply. Your answer is still here. Please try again.",
  });
  expect(request).toHaveBeenCalledTimes(1);
});

it('lets an explicit retry reuse the identical answer and request ID', async () => {
  const request = vi.fn().mockImplementationOnce(async () => { throw new Error('connection lost'); })
    .mockImplementation(async () => Response.json({ text: 'Tudo bem!' }));
  vi.stubGlobal('fetch', request);
  await expect(apiRequest('/sessions/example/turns', options)).rejects.toThrow('answer is still here');
  expect(await apiRequest('/sessions/example/turns', options)).toEqual({ text: 'Tudo bem!' });
  expect(request.mock.calls.map(call => call[1].body)).toEqual([options.body, options.body]);
});

it.each(['/auth/google', '/speech/transcribe', '/sessions/example/speech', '/friends'])('does not replay unrelated mutations: %s', async path => {
  const request = vi.fn(async () => Response.json({ detail: 'Please retry.' }, { status: 503 }));
  vi.stubGlobal('fetch', request);
  await expect(apiRequest(path, options)).rejects.toMatchObject({ status: 503 });
  expect(request).toHaveBeenCalledTimes(1);
});
