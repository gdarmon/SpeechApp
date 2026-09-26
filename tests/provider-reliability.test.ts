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
  it('repairs a rank offer after the learner said they have no cord', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = { ...reply, text: 'Você quer essa corda?', translation: 'Do you want that cord?',
      turn_feedback: { kind: 'ok' as const, message: 'You do not have a cord yet.', said: '', natural: '' } };
    const good = { ...bad, text: 'Você treina com seu professor?', translation: 'Do you train with your teacher?',
      suggested_replies: [{ text: 'Treino com meu professor.', translation: 'I train with my teacher.' },
        { text: 'Ainda não treino com ele.', translation: 'I do not train with him yet.' }] };
    const bodies: any[] = [];
    const request = vi.fn(async (_url, init) => {
      bodies.push(JSON.parse(init.body as string));
      return ok(bodies.length === 1 ? bad : good);
    });
    const result = await new CompatibleProvider(settings, new Timing(), request).reply({ action: 'continue',
      lesson: {}, practice: { level: 1 }, input: { text: 'Ainda não tenho corda.' }, support_language: 'en-US' });
    expect(result).toEqual(good);
    expect(bodies[0].messages[0].content).toContain('Current learner fact: they DO NOT HAVE A CORDA');
    expect(bodies[1].messages.at(-1).content).toContain('Do not ask them to choose/want a rank');
  });
  it('regenerates a copied finta/repeat pair when the next question asks for confirmation', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const opening = { ...reply, text: 'Qual nome quer ouvir?', translation: 'Which name would you like to hear?',
      suggested_replies: [{ text: 'Quero finta.', translation: 'I want finta.' }, { text: 'Pode repetir?', translation: 'Could you repeat?' }] };
    const stale = { ...opening, text: 'Quer ouvir esse nome devagar?', translation: 'Would you like to hear that name slowly?',
      turn_feedback: { kind: 'guided' as const, message: 'You used the example to make a request.', said: '', natural: '' } };
    const repaired = { ...stale, suggested_replies: [
      { text: 'Sim, finta, devagar.', translation: 'Yes, finta, slowly.' },
      { text: 'Não, pode falar normalmente.', translation: 'No, you can speak at a normal pace.' },
    ] };
    const bodies: Record<string, any>[] = [];
    const request = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
      bodies.push(JSON.parse(init!.body as string));
      return ok(bodies.length === 1 ? stale : repaired);
    });
    expect(await new CompatibleProvider(settings, new Timing(), request).reply({ action: 'continue',
      practice: { level: 1 }, opening: { text: opening.text, suggested_replies: opening.suggested_replies.map(idea => idea.text) },
      input: { text: 'Quero finta.', assisted: true }, support_language: 'en-US' })).toEqual(repaired);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].messages.at(-1).content).toContain('both answer ideas were copied');
  });

  it('repairs the actual rejected reply without logging the learner or generated text', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invalid = { ...reply, turn_feedback: { kind: 'correction' as const, message: 'Use this phrase.', said: 'invented private answer', natural: 'Tudo certo.' } };
    const repaired = { ...reply, turn_feedback: { kind: 'guided' as const, message: 'That answer fits the question.', said: '', natural: '' } };
    const context = { action: 'continue', input: { text: 'Tudo bem.' }, support_language: 'en-US' };
    const bodies: Record<string, any>[] = [];
    const request = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
      bodies.push(JSON.parse(init!.body as string));
      return ok(bodies.length === 1 ? invalid : repaired);
    });
    expect(await new CompatibleProvider(settings, new Timing(), request).reply(context)).toEqual(repaired);
    expect(bodies).toHaveLength(2);
    expect(bodies[1].messages[1]).toEqual(bodies[0].messages[1]);
    expect(bodies[1].messages[2]).toEqual({ role: 'assistant', content: JSON.stringify(invalid) });
    expect(bodies[1].messages[3].content).toContain('Quote only the current learner answer.');
    expect(log.mock.calls.flat().join(' ')).not.toContain('invented private answer');
    expect(log.mock.calls.flat().join(' ')).not.toContain('Tudo bem.');
  });

  it('constrains generated ideas to the learner level and starts with slow playback', async () => {
    let body: any;
    const request = vi.fn(async (_url: unknown, init: RequestInit | undefined) => { body = JSON.parse(init!.body as string); return ok(); });
    await new CompatibleProvider({ ...settings, baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b' }, new Timing(), request)
      .reply({ action: 'start', practice: { level: 1 } });
    const properties = body.response_format.json_schema.schema.properties;
    expect(properties.suggested_replies.items.properties.text.maxLength).toBe(70);
    expect(properties.pace.const).toBe('slow');
    expect(properties.translation.minLength).toBe(1);
  });

  it.each(['0', '14', '26', '32', 'invalid'])('never waits on the same limited service (%s)', async header => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const request = vi.fn(async () => throttle(header));
    await expect(new CompatibleProvider(settings, new Timing(), request).reply({ action: 'start' }))
      .rejects.toMatchObject({ status: 429, code: 'ai_rate_limited' });
    expect(request).toHaveBeenCalledTimes(1);
  });
});

let credentialNumber = 0;
function withBackup() {
  return { ...settings, apiKey: `primary-${++credentialNumber}`, aiHedgeMs: 1200, aiTimeoutMs: 8000,
    fallback: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-luna', apiKey: `backup-${credentialNumber}` } };
}
const hanging = (signal: AbortSignal) => new Promise<Response>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));

describe('validated provider failover', () => {
  it.each([429, 503, 401])('uses the other configured credential immediately on HTTP %s', async status => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = withBackup();
    const bodies: any[] = [];
    const request = vi.fn(async (url, init) => {
      bodies.push(JSON.parse(init.body as string));
      expect(init.redirect).toBe('error');
      if (String(url).includes('groq')) {
        expect(init.headers.Authorization).toBe(`Bearer ${config.apiKey}`);
        return new Response('private provider error', { status, headers: { 'Retry-After': '26' } });
      }
      expect(init.headers.Authorization).toBe(`Bearer ${config.fallback.apiKey}`);
      expect(bodies.at(-1).reasoning_effort).toBe('none');
      expect(bodies.at(-1).store).toBe(false);
      return ok();
    });
    expect(await new CompatibleProvider(config, new Timing(), request).reply({ action: 'start' })).toEqual(reply);
    expect(request).toHaveBeenCalledTimes(2);
    expect(bodies[0].messages).toEqual(bodies[1].messages);
  });

  it('starts backup after the hedge and aborts the slower request after a valid reply', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const request = vi.fn(async (url, init) => {
      signals.push(init.signal);
      return String(url).includes('groq') ? hanging(init.signal) : ok();
    });
    const result = new CompatibleProvider(withBackup(), new Timing(), request).reply({ action: 'start' });
    await vi.advanceTimersByTimeAsync(1199);
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual(reply);
    expect(request).toHaveBeenCalledTimes(2);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not call backup when the primary succeeds before the hedge', async () => {
    vi.useFakeTimers();
    const request = vi.fn(async () => ok());
    expect(await new CompatibleProvider(withBackup(), new Timing(), request).reply({ action: 'start' })).toEqual(reply);
    await vi.advanceTimersByTimeAsync(10000);
    expect(request).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a viable primary when the newly started backup is rate-limited', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const request = vi.fn(async (url, init) => {
      if (!String(url).includes('groq')) return throttle('26');
      await new Promise(resolve => setTimeout(resolve, 1500));
      expect(init.signal.aborted).toBe(false);
      return ok();
    });
    const result = new CompatibleProvider(withBackup(), new Timing(), request).reply({ action: 'start' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(await result).toEqual(reply);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('recovers immediately from a connection failure without leaking its exception', async () => {
    const request = vi.fn(async url => {
      if (String(url).includes('groq')) throw Error('private network credential details');
      return ok();
    });
    expect(await new CompatibleProvider(withBackup(), new Timing(), request).reply({ action: 'start' })).toEqual(reply);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not let a fast invalid reply win or reach the caller', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const request = vi.fn(async url => String(url).includes('groq') ? ok({ ...reply, translation: '' }) : ok());
    expect(await new CompatibleProvider(withBackup(), new Timing(), request).reply({ action: 'start' })).toEqual(reply);
    expect(request.mock.calls.filter(([url]) => String(url).includes('groq'))).toHaveLength(2);
    expect(request.mock.calls.filter(([url]) => String(url).includes('openai.com'))).toHaveLength(1);
  });

  it('uses one deadline, cancels both requests and reports a recoverable error', async () => {
    vi.useFakeTimers();
    const request = vi.fn(async (_url, init) => hanging(init.signal));
    const result = new CompatibleProvider(withBackup(), new Timing(), request).reply({ action: 'start' });
    const assertion = expect(result).rejects.toMatchObject({ status: 503, code: 'ai_timeout' });
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.every(([, init]) => init.signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not return provider quota countdowns when both configured routes fail', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const request = vi.fn(async () => throttle('32'));
    await expect(new CompatibleProvider(withBackup(), new Timing(), request).reply({ action: 'start' }))
      .rejects.toMatchObject({ status: 503, code: 'ai_unavailable', message: "We couldn't get a reply. Your answer is still here. Please try again." });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('skips a recent capacity failure but does not share that hint across credentials', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = withBackup();
    const limited = vi.fn(async url => String(url).includes('groq') ? throttle('26') : ok());
    await new CompatibleProvider(config, new Timing(), limited).reply({ action: 'start' });
    const retry = vi.fn(async (_url: unknown) => ok());
    await new CompatibleProvider(config, new Timing(), retry).reply({ action: 'start' });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(String(retry.mock.calls[0][0])).toContain('api.openai.com');
    const independent = vi.fn(async (_url: unknown) => ok());
    await new CompatibleProvider(withBackup(), new Timing(), independent).reply({ action: 'start' });
    expect(String(independent.mock.calls[0][0])).toContain('api.groq.com');
  });

  it('records numeric capacity and token usage without headers, credentials or content', async () => {
    const provider = new CompatibleProvider(settings, new Timing(), async () => Response.json({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(reply) } }],
      usage: { prompt_tokens: 3200, completion_tokens: 180 },
    }, { headers: { 'x-ratelimit-limit-tokens': '2000000', 'x-ratelimit-limit-requests': '5000', Authorization: 'private' } }));
    await provider.reply({ action: 'start' });
    expect(provider.observations[0]).toMatchObject({ status: 200, input_tokens: 3200, output_tokens: 180,
      limits: { 'limit-tokens': 2000000, 'limit-requests': 5000 } });
    expect(JSON.stringify(provider.observations)).not.toMatch(/private|Tudo bem|test-key/);
  });
});
