import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = process.cwd();
await mkdir('artifacts', { recursive: true });
const toml = await readFile('netlify.toml', 'utf8');
const csp = toml.match(/Content-Security-Policy = "(.*)"/)[1];
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/app/') && pathname !== '/logo.png') { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{"detail":"Sign in"}'); return; }
    const file = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
    const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.webmanifest') ? 'application/manifest+json' : file.endsWith('.png') ? 'image/png' : 'text/html';
    res.writeHead(200, { 'Content-Type': type, 'Content-Security-Policy': csp }); res.end(await readFile(`${root}/public${file}`));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.FALA_TEST_CHROME || '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'], serviceWorkers: 'block' });
  const page = await context.newPage(); const errors = [], familyRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/app/`);
  // Releasing before permission resolves must close the late stream without producing an answer.
  const latePermission = await page.evaluate(async () => {
    const { Recorder } = await import('/app/voice.js');
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const stream = await original({ audio: true }); let grant, answers = 0;
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { grant = resolve; });
    const recorder = new Recorder(() => {}, () => answers++, () => {});
    const started = recorder.start(); recorder.stop(); grant(stream); await started;
    navigator.mediaDevices.getUserMedia = original;
    return { answers, closed: stream.getTracks().every(track => track.readyState === 'ended') };
  });
  assert.deepEqual(latePermission, { answers: 0, closed: true });
  await page.locator('#family-begin').click();
  page.on('request', request => { if (request.url().startsWith('http')) familyRequests.push(new URL(request.url()).pathname); });
  await page.locator('#family-start').click();
  assert.match(await page.locator('#partner-text').innerText(), /Oi/);
  assert.equal(await page.locator('#partner-translation').getAttribute('dir'), 'rtl');
  const mic = page.locator('#microphone'); await mic.scrollIntoViewIfNeeded();
  const position = await mic.boundingBox();
  await page.mouse.move(position.x + 50, position.y + 50); await page.mouse.down();
  await page.waitForFunction(() => document.getElementById('microphone').dataset.recording === 'true');
  await page.waitForTimeout(800); await page.mouse.up();
  await page.locator('#recording').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.getElementById('microphone').dataset.recording), 'false');
  const localUrl = await page.locator('#recording').getAttribute('src'); assert.ok(localUrl.startsWith('blob:'));
  await page.locator('#family-next').click();
  assert.equal(await page.locator('#recording').getAttribute('src'), null);
  for (let i = 1; i < 10; i++) await page.locator('#family-next').click();
  await page.locator('#review').waitFor({ state: 'visible' }); assert.equal(await page.locator('.word').count(), 5);
  assert.equal(familyRequests.filter(path => !path.startsWith('/app/') && path !== '/logo.png').length, 0);
  await page.screenshot({ path: `${root}/artifacts/fala-web-family-review.png`, fullPage: true });
  assert.deepEqual(errors, []);
  // Exercise the online UI with a deterministic API and audio fixture, without a Google account.
  let saved, dropGet = false, postCount = 0; const ids = [], words = [{ word: 'ginga', translation: 'תנועת בסיס' }];
  const reply = { text: 'Você conhece a ginga?', translation: 'מכירים את הג׳ינגה?', suggested_replies: [{ text: 'Sim, conheço.', translation: 'כן, אני מכיר.' }] };
  const wav = Buffer.alloc(44 + 16000); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
  await page.route('**/*', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const send = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/auth/me') return send({ email: 'browser-fixture@fala.invalid' });
    if (path === '/dashboard') return send({ progress: { practice: { level: 1, title: 'First phrases', goal: 'Simple replies.' } }, history: [] });
    if (path === '/sessions') { saved = { id: 'session-fixture', topic: 'Capoeira', support_language: 'he-IL', practice: { level: 1 }, opening: reply, turns: [] }; return send(saved); }
    if (path.endsWith('/speech')) return route.fulfill({ status: 200, contentType: 'audio/wav', body: wav });
    if (path === '/speech/transcribe') { assert.ok(request.postDataBuffer().length > 128); return send({ text: 'Sim, conheço.' }); }
    if (path.endsWith('/turns')) {
      const input = request.postDataJSON(); ids.push(input.request_id); postCount++;
      if (!saved.turns.some(turn => turn.request_id === input.request_id)) saved.turns.push({ ...input, id: saved.turns.length + 1, reply: { ...reply, text: 'Você gosta do martelo?', translation: 'אוהבים את המרטלו?', suggested_replies: [{ text: 'Sim, gosto.', translation: 'כן, אני אוהב.' }], turn_feedback: { kind: 'ok', message: 'יופי!' } } });
      if (postCount === 1) dropGet = true;
      return send(saved.turns.at(-1).reply);
    }
    if (path.endsWith('/finish')) return send({ summary: 'כל הכבוד!', vocabulary: words, pointers: ['נסו בלי ההצעה.'] });
    if (path === '/sessions/session-fixture') { if (dropGet) { dropGet = false; return route.abort(); } return send(saved); }
    return route.continue();
  });
  await page.goto(`${base}/app/`); await page.locator('#home').waitFor({ state: 'visible' });
  await page.locator('#start').click(); await page.locator('#conversation').waitFor({ state: 'visible' });
  await page.locator('#send').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.getElementById('microphone').disabled);
  await mic.scrollIntoViewIfNeeded(); const box = await mic.boundingBox();
  await page.mouse.move(box.x + 50, box.y + 40); await page.mouse.down();
  await page.waitForFunction(() => document.getElementById('microphone').dataset.recording === 'true');
  await page.waitForTimeout(800); await page.mouse.up();
  await page.waitForFunction(() => document.getElementById('draft').value === 'Sim, conheço.');
  await page.locator('#send').click(); await page.locator('#retry').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#draft').isDisabled(), true);
  await page.locator('#retry').click();
  await page.waitForFunction(() => document.getElementById('round').textContent === '2 / 10');
  assert.equal(ids[0], ids[1]); assert.equal(saved.turns.length, 1);
  assert.equal(saved.turns[0].source, 'speech');
  await page.screenshot({ path: `${root}/artifacts/fala-web-conversation.png`, fullPage: true });
  for (let i = 1; i < 10; i++) {
    await page.locator('#draft').fill('Sim, gosto da ginga.'); await page.locator('#send').click();
    await page.waitForFunction(() => !document.getElementById('send').disabled);
  }
  assert.equal(saved.turns.length, 10); assert.equal(await page.locator('#microphone').isVisible(), false);
  await page.locator('#finish').click(); await page.locator('#review').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.word').count(), 1); assert.deepEqual(errors, []);
  await context.close();
  // Offline installation cache contains public assets, not API or recordings.
  const offline = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const offlinePage = await offline.newPage(); await offlinePage.goto(`${base}/app/`);
  await offlinePage.evaluate(() => navigator.serviceWorker.ready);
  await offlinePage.reload(); await offline.setOffline(true); await offlinePage.goto(`${base}/app/#family`);
  await offlinePage.reload(); await offlinePage.locator('#family-start').click();
  assert.match(await offlinePage.locator('#partner-text').innerText(), /Oi/);
  const cached = await offlinePage.evaluate(async () => { const keys = await caches.keys(); return (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(req => new URL(req.url).pathname)))).flat(); });
  assert.ok(cached.length >= 8); assert.ok(cached.every(path => path.startsWith('/app/') || path === '/logo.png'));
  await offline.close();
  console.log('PASS: family local recording/replay and 10 exchanges; zero family API calls; Hebrew RTL; online recording/transcription and 10 turns; idempotent retry after lost response; 5-word cap; offline public-only cache; no browser exceptions.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
