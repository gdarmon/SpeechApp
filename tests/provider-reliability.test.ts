import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompatibleProvider } from '../src/provider.js';
import { settingsFromEnv } from '../src/config.js';
import { replySchema } from '../src/models.js';
import { Timing } from '../src/timing.js';

const settings = settingsFromEnv({ FALA_TOKEN: 'private-test-token-32-characters-long', DATABASE_URL: 'postgres://localhost/fala', OPENAI_API_KEY: 'test-key' });
const reply = replySchema.parse({ text: 'Oi! Tudo bem?', translation: 'Hi! How are you?', pace: 'slow',
  suggested_replies: [{ text: 'Tudo bem.', translation: 'I am well.' }, { text: 'Mais ou menos.', translation: 'So-so.' }] });
const ok = (value = reply) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] });
const throttle = (seconds: string) => new Response('private provider details', { status: 429, headers: { 'Retry-After': seconds } });

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('provider throttling recovery', () => {
  it('waits for a normal token refill and repairs a malformed reply without dropping either retry', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bodies: string[] = [];
    const request = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
      bodies.push(init!.body as string);
      if (bodies.length === 1) return ok({ ...reply, translation: '' });
      if (bodies.length === 2) return throttle('14');
      return ok();
    });
    const promise = new CompatibleProvider(settings, new Timing(), request).reply({ action: 'start' });
    await vi.advanceTimersByTimeAsync(14249);
    expect(request).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(await promise).toEqual(reply);
    expect(request).toHaveBeenCalledTimes(3);
    expect(bodies[1]).toBe(bodies[2]);
    expect(log.mock.calls.flat().join(' ')).not.toContain('private provider details');
  });

  it.each(['31', '120', '86400', 'invalid', '-5'])('does not hammer long or invalid limits (%s)', async header => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const request = vi.fn(async () => throttle(header));
    await expect(new CompatibleProvider(settings, new Timing(), request).reply({ action: 'start' }))
      .rejects.toMatchObject({ status: 429, code: 'ai_rate_limited', retryAfterSeconds: Number(header) > 0 ? Number(header) : 60 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('leaves time to generate and save a reply instead of waiting past its deadline', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const request = vi.fn(async () => throttle('14'));
    await expect(new CompatibleProvider({ ...settings, aiTimeoutMs: 18000 }, new Timing(), request).reply({ action: 'start' }))
      .rejects.toMatchObject({ status: 429, retryAfterSeconds: 14 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('bounds repeated throttles even when the provider asks for immediate retry', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const request = vi.fn(async () => throttle('0'));
    const result = new CompatibleProvider(settings, new Timing(), request).reply({ action: 'start' });
    const assertion = expect(result).rejects.toMatchObject({ status: 429, retryAfterSeconds: 1 });
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('accepts HTTP-date Retry-After without losing the original request', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
    vi.setSystemTime(new Date('2026-09-21T10:00:00Z'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const request = vi.fn().mockImplementationOnce(async () => throttle('Mon, 21 Sep 2026 10:00:02 GMT')).mockImplementation(async () => ok());
    const result = new CompatibleProvider(settings, new Timing(), request).reply({ action: 'start' });
    await vi.advanceTimersByTimeAsync(2250);
    expect(await result).toEqual(reply);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
