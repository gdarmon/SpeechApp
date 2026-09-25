import { expect, it } from 'vitest';
import { Speech, AUDIO_LIMIT, readRecording, spokenReply } from '../src/speech.js';
import { settingsFromEnv } from '../src/config.js';
import { replySchema } from '../src/models.js';
const settings = settingsFromEnv({ DATABASE_URL: 'postgres://local/fala', GOOGLE_WEB_CLIENT_ID: 'fala-test.apps.googleusercontent.com', FALA_OPENAI_API_KEY: 'server-only-fixture' });
const request = (mime: string, size: number) => new Request('https://fala.test/speech/transcribe', {
  method: 'POST', headers: { 'Content-Type': mime }, body: new Uint8Array(size),
});
it('accepts Safari MP4 and Chrome WebM, bounds streamed audio and rejects unsupported or empty recordings', async () => {
  expect(await readRecording(request('audio/mp4', 400))).toMatchObject({ mime: 'audio/mp4', extension: 'mp4' });
  expect(await readRecording(request('audio/webm;codecs=opus', 400))).toMatchObject({ mime: 'audio/webm', extension: 'webm' });
  await expect(readRecording(request('text/plain', 400))).rejects.toMatchObject({ status: 415 });
  await expect(readRecording(request('audio/webm', 0))).rejects.toMatchObject({ status: 400 });
  await expect(readRecording(request('audio/webm', AUDIO_LIMIT + 1))).rejects.toMatchObject({ status: 413 });
});
it('sends transient multipart audio to the fixed OpenAI endpoint with the selected language', async () => {
  const speech = new Speech(settings, async (url, init) => {
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(init?.redirect).toBe('error'); expect(init?.signal).toBeDefined();
    const body = init?.body as FormData;
    expect(body.get('model')).toBe('gpt-4o-mini-transcribe'); expect(body.get('language')).toBe('pt');
    expect((body.get('file') as File).name).toBe('answer.mp4');
    return Response.json({ text: ' Gosto da ginga. ' });
  });
  expect(await speech.transcribe(await readRecording(request('audio/mp4', 300)), 'pt')).toEqual({ text: 'Gosto da ginga.' });
});
it('speaks the saved Portuguese reply with a Brazilian voice and no arbitrary provider URL', async () => {
  const reply = replySchema.parse({ text: 'E você?', turn_feedback: { kind: 'correction', natural: 'Eu fui.', message: 'Use fui.' } });
  const speech = new Speech(settings, async (url, init) => {
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ model: 'gpt-4o-mini-tts', voice: 'coral', input: spokenReply(reply), response_format: 'mp3' });
    expect(body.instructions).toContain('Brazilian Portuguese');
    expect(body.instructions).toContain('natural conversational pace');
    expect(body.instructions).not.toContain('slow beginner-friendly');
    return new Response(new Uint8Array([1, 2, 3]));
  });
  expect(new Uint8Array(await speech.speak(reply))).toEqual(new Uint8Array([1, 2, 3]));
});
it('does not send incompatible credentials to OpenAI or expose raw voice provider errors', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw new Error('secret-provider-value'); };
  const recording = await readRecording(request('audio/webm', 300));
  await expect(new Speech(settingsFromEnv({ DATABASE_URL:'postgres://local/fala', GOOGLE_WEB_CLIENT_ID:'fala-test.apps.googleusercontent.com', OPENAI_API_KEY:'groq-fixture', OPENAI_BASE_URL:'https://api.groq.com/openai/v1', FALA_TRANSCRIPTION_PROVIDER:'openai' }), fetcher).transcribe(recording, 'pt')).rejects.toMatchObject({ status: 503 });
  expect(calls).toBe(0);
  await expect(new Speech(settings, fetcher).transcribe(recording, 'pt')).rejects.not.toThrow('secret-provider-value');
  const blank = new Speech(settings, async () => Response.json({ text: '' }));
  await expect(blank.transcribe(recording, 'pt')).rejects.toMatchObject({ status: 422 });
});

it('routes hybrid chat and transcription to Groq while keeping the OpenAI voice credential separate', async () => {
  const hybrid=settingsFromEnv({DATABASE_URL:'postgres://local/fala',GOOGLE_WEB_CLIENT_ID:'fala-test.apps.googleusercontent.com',FALA_AI_PROVIDER:'groq',FALA_TRANSCRIPTION_PROVIDER:'groq',OPENAI_API_KEY:'groq-only',OPENAI_BASE_URL:'https://api.groq.com/openai/v1',FALA_OPENAI_API_KEY:'openai-voice-only'});
  expect(hybrid).toMatchObject({apiKey:'groq-only',baseUrl:'https://api.groq.com/openai/v1',model:'openai/gpt-oss-120b',voiceApiKey:'openai-voice-only'});
  const paths:string[]=[];
  const speech=new Speech(hybrid,async(url,init)=>{
    const transcribing=String(url).endsWith('/transcriptions');paths.push(String(url));
    expect((init?.headers as Record<string,string>).Authorization).toBe(`Bearer ${transcribing?'groq-only':'openai-voice-only'}`);
    if(transcribing){const form=init?.body as FormData;expect(form.get('model')).toBe('whisper-large-v3-turbo');expect(form.get('language')).toBe('he');return Response.json({text:'שלום'});}
    return new Response(new Uint8Array([1,2,3]));
  });
  expect(await speech.transcribe(await readRecording(request('audio/mp4',300)),'he')).toEqual({text:'שלום'});
  await speech.speak(replySchema.parse({text:'Oi!'}));
  expect(paths).toEqual(['https://api.groq.com/openai/v1/audio/transcriptions','https://api.openai.com/v1/audio/speech']);
});
it('does not silently fall back to paid OpenAI when Groq is selected but unavailable', async()=>{
  const missing=settingsFromEnv({DATABASE_URL:'postgres://local/fala',GOOGLE_WEB_CLIENT_ID:'fala-test.apps.googleusercontent.com',FALA_AI_PROVIDER:'groq',FALA_TRANSCRIPTION_PROVIDER:'groq',FALA_OPENAI_API_KEY:'openai-voice-only',OPENAI_BASE_URL:'https://api.openai.com/v1',OPENAI_API_KEY:'another-openai-key'});
  expect(missing.apiKey).toBe('');expect(missing.transcription.apiKey).toBe('');
  let calls=0;await expect(new Speech(missing,async()=>{calls++;throw Error('must not call');}).transcribe(await readRecording(request('audio/webm',300)),'pt')).rejects.toMatchObject({status:503});expect(calls).toBe(0);
  expect(()=>settingsFromEnv({DATABASE_URL:'postgres://local/fala',GOOGLE_WEB_CLIENT_ID:'fala-test.apps.googleusercontent.com',FALA_AI_PROVIDER:'gork'})).toThrow();
});
