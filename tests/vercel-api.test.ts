import { expect, it, vi } from 'vitest';
import { createVercelHandler, PUBLIC_ORIGIN } from '../deploy/vercel-api/handler.js';
import { sameOrigin } from '../src/auth.js';

it('preserves the public origin, credentials, method and body through the API rewrite', async () => {
  const handler = vi.fn(async (request: Request) => {
    sameOrigin(request);
    expect(request.url).toBe(`${PUBLIC_ORIGIN}/sessions/one/turns`);
    expect(request.method).toBe('POST');
    expect(request.headers.get('cookie')).toBe('__Host-fala=synthetic');
    expect(await request.json()).toEqual({ request_id: 'same-id' });
    return Response.json({ text: 'Tudo bem?' }, { headers: { 'X-Fala-Turn-Id': '42', 'Cache-Control': 'no-store' } });
  });
  const result = await createVercelHandler(handler)(new Request('https://fala-api.vercel.app/api/service?route=/sessions/one/turns', {
    method: 'POST', headers: { Origin: PUBLIC_ORIGIN, Cookie: '__Host-fala=synthetic', 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: 'same-id' }) }));
  expect(result.status).toBe(200); expect(result.headers.get('X-Fala-Turn-Id')).toBe('42');
  expect(result.headers.get('Cache-Control')).toBe('no-store');
});
it('does not let forwarded hosts authorize a foreign browser origin', async () => {
  const handler = vi.fn(async (request: Request) => { expect(() => sameOrigin(request)).toThrow(); return new Response(null, { status: 403 }); });
  const result = await createVercelHandler(handler)(new Request('https://fala-api.vercel.app/sessions', {
    method: 'POST', headers: { Origin: 'https://foreign.invalid', 'X-Forwarded-Host': 'foreign.invalid' }, body: '{}' }));
  expect(result.status).toBe(403);
});
it('rejects external and ambiguous rewrite targets before invoking the API', async () => {
  const handler = vi.fn();
  for (const route of ['https://foreign.invalid/sessions', '//foreign.invalid', '//foreign', '/sessions?x=y', '/../sessions']) {
    expect((await createVercelHandler(handler)(new Request(`https://fala-api.vercel.app/api/service?route=${encodeURIComponent(route)}`))).status).toBe(404);
  }
  expect(handler).not.toHaveBeenCalled();
});

it('allows the exact legacy site through the migration proxy while preserving cookie CSRF checks', async () => {
  const handler = vi.fn(async (request: Request) => {
    sameOrigin(request);
    expect(request.url).toBe('https://falachatapp.netlify.app/sessions');
    expect(request.headers.get('cookie')).toBe('__Host-fala=synthetic');
    return Response.json({ ok: true });
  });
  expect((await createVercelHandler(handler)(new Request(`${PUBLIC_ORIGIN}/api/service?route=/sessions`, {
    method: 'POST', headers: { Origin: 'https://falachatapp.netlify.app', Cookie: '__Host-fala=synthetic' }, body: '{}',
  }))).status).toBe(200);
});
