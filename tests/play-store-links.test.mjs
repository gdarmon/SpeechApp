import { it, expect } from 'vitest';
import { updateStoreLinks } from '../scripts/play-store-links.mjs';

it('replaces only legacy URLs, verifies a fresh edit, and never alters tracks or screenshots', async () => {
  const calls = [], edits = ['edit', 'verify'];
  let details = { contactWebsite: 'https://falachatapp.netlify.app', contactEmail: 'fixture@example.invalid' };
  let listing = { language: 'en-US', title: 'Original title', fullDescription: 'Existing copy\nPrivacy: https://falachatapp.netlify.app/privacy.html\nKeep this text.', shortDescription: 'Original summary' };
  const fake = async (url, options) => {
    const path = new URL(url).pathname.split('/edits')[1]; calls.push({ path, method: options.method, body: options.body });
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    if (path === '') return Response.json({ id: edits.shift() });
    if (path.endsWith('/details')) { if (options.method === 'PATCH') details = { ...details, ...JSON.parse(options.body) }; return Response.json(details); }
    if (path.endsWith('/listings')) return Response.json({ listings: [listing] });
    if (path.endsWith('/listings/en-US')) { if (options.method === 'PATCH') listing = { ...listing, ...JSON.parse(options.body) }; return Response.json(listing); }
    return Response.json({});
  };
  const result = await updateStoreLinks('synthetic', fake);
  expect(result).toMatchObject({ committed: true, verified: true, website_updated: true, languages_updated: ['en-US'] });
  expect(details).toEqual({ contactWebsite: 'https://fala-api.vercel.app', contactEmail: 'fixture@example.invalid' });
  expect(listing).toMatchObject({ title: 'Original title', shortDescription: 'Original summary', fullDescription: 'Existing copy\nPrivacy: https://fala-api.vercel.app/privacy.html\nKeep this text.' });
  expect(calls.some(c => /tracks|bundles|Screenshots/.test(c.path))).toBe(false);
  expect(calls.some(c => c.path === '/verify' && c.method === 'DELETE')).toBe(true);
});
it('aborts a forbidden edit and does not replace a pending review or retry', async () => {
  const calls = [];
  const fake = async (url, options) => {
    const path = new URL(url).pathname.split('/edits')[1]; calls.push([path, options.method]);
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    if (path === '') return Response.json({ id: 'edit' });
    if (options.method === 'PATCH') return new Response(null, { status: 403 });
    return Response.json(path.endsWith('/details') ? { contactWebsite: 'https://falachatapp.netlify.app' } : { listings: [] });
  };
  await expect(updateStoreLinks('synthetic', fake)).rejects.toThrow('HTTP 403');
  expect(calls.at(-1)).toEqual(['/edit', 'DELETE']);
  expect(calls.some(([path]) => /commit/.test(path))).toBe(false);
});
