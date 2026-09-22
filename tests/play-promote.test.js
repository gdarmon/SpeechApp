import { describe, it, expect } from 'vitest';
import { promoteClosedTest } from '../scripts/play-promote.mjs';
import { releaseMetadata } from '../scripts/release.mjs';

const release = releaseMetadata('0.13.0', 'A first-use guide, gentle reminders and optional updates.');
const source = { name: 'Fala 0.13.0 (103201)', versionCodes: ['103201'], status: 'completed', releaseNotes: release.notes };
function play({ internal = source, alpha = [{ name: '0.12.4', versionCodes: ['103101'], status: 'completed' }],
                rejectCommit = false, verificationMismatch = false } = {}) {
  const calls = [];
  let edits = 0, committed = false, proposed;
  const request = async (address, options) => {
    const url = new URL(address); calls.push({ url, ...options });
    if (url.pathname.endsWith('/edits')) return Response.json({ id: `edit${++edits}` });
    if (options.method === 'DELETE') return new Response(null, { status: 204 });
    if (url.pathname.endsWith('/tracks')) return Response.json({ tracks: [
      { track: 'production' }, { track: 'internal', releases: [internal] },
      { track: 'alpha', releases: committed && !verificationMismatch ? proposed.releases : alpha },
    ] });
    if (url.pathname.endsWith('/tracks/alpha') && options.method === 'PUT') {
      proposed = JSON.parse(options.body); return Response.json(proposed);
    }
    if (url.pathname.endsWith(':validate')) return Response.json({ id: 'edit1' });
    if (url.pathname.endsWith(':commit')) {
      if (rejectCommit) return Response.json({ error: { message: 'secret-access-token', details: [{ reason: 'CHANGES_ALREADY_IN_REVIEW' }] } }, { status: 400 });
      committed = true; return Response.json({ id: 'edit1' });
    }
    throw Error(`Unexpected call: ${options.method} ${url.pathname}`);
  };
  return { request, calls };
}
const promote = (mock, extra = {}) => promoteClosedTest({ token: 'secret-access-token', expectedVersion: 103201, release, request: mock.request, ...extra });

describe('explicit closed-test promotion', () => {
  it('reuses only the approved internal bundle and notes, and verifies the committed Alpha state', async () => {
    const mock = play(); const result = await promote(mock);
    expect(result).toMatchObject({ version: '0.13.0', versionCode: 103201, track: 'alpha', status: 'completed', verified: true });
    const writes = mock.calls.filter(call => call.method === 'PUT');
    expect(writes).toHaveLength(1);
    expect(writes[0].url.pathname.endsWith('/tracks/alpha')).toBe(true);
    expect(JSON.parse(writes[0].body)).toEqual({ track: 'alpha', releases: [source] });
    const commit = mock.calls.find(call => call.url.pathname.endsWith(':commit'));
    expect(commit.url.searchParams.get('changesInReviewBehavior')).toBe('ERROR_IF_IN_REVIEW');
    expect(commit.body).toBeUndefined();
    expect(mock.calls.at(-2).url.pathname.endsWith('/edit2/tracks')).toBe(true);
    expect(mock.calls.at(-1).method).toBe('DELETE');
    expect(result.before.filter(t => t.track !== 'alpha')).toEqual(result.after.filter(t => t.track !== 'alpha'));
    expect(mock.calls.every(c => c.redirect === 'error' && c.signal instanceof AbortSignal)).toBe(true);
  });
  it('does not republish an already completed matching promotion', async () => {
    const mock = play({ alpha: [source] });
    expect(await promote(mock)).toMatchObject({ alreadyPromoted: true, verified: true });
    expect(mock.calls.some(c => c.method === 'PUT' || c.url.pathname.endsWith(':commit'))).toBe(false);
  });
  it('refuses missing, draft, mismatched or differently documented internal builds', async () => {
    for (const change of [{ status: 'draft' }, { versionCodes: ['103202'] }, { name: 'Fala 0.14.0 (103201)' }, { releaseNotes: [] }]) {
      const mock = play({ internal: { ...source, ...change } });
      await expect(promote(mock)).rejects.toThrow('exact version and release notes');
      expect(mock.calls.some(c => c.method === 'PUT')).toBe(false);
    }
  });
  it('preserves newer releases and unrelated draft or staged rollouts', async () => {
    for (const alpha of [
      [{ ...source, versionCodes: ['103301'] }], [{ ...source, name: 'Different release' }],
      [{ name: 'draft', versionCodes: ['103101'], status: 'draft' }],
      [{ name: 'rollout', versionCodes: ['103101'], status: 'inProgress' }],
    ]) {
      const mock = play({ alpha }); await expect(promote(mock)).rejects.toThrow();
      expect(mock.calls.some(c => c.method === 'PUT')).toBe(false);
    }
  });
  it('does not cancel a pending review or leak error bodies', async () => {
    const mock = play({ rejectCommit: true });
    await expect(promote(mock)).rejects.toThrow('did not cancel');
    expect(mock.calls.filter(c => c.url.pathname.endsWith(':commit'))).toHaveLength(1);
    expect(mock.calls.at(-1).method).toBe('DELETE');
  });
  it('does not report success when a fresh edit fails to show the promoted version', async () => {
    await expect(promote(play({ verificationMismatch: true }))).rejects.toThrow('could not be verified');
  });
  it('requires explicit valid build input before contacting Play', async () => {
    for (const expectedVersion of [0, NaN, 1.5, 2100000001]) {
      const mock = play(); await expect(promote(mock, { expectedVersion })).rejects.toThrow();
      expect(mock.calls).toEqual([]);
    }
  });
});
