import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
let migrated = false;
const target = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<h1>New Fala origin</h1>'); });
await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
const targetUrl = `http://127.0.0.1:${target.address().port}/app/`;
const old = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/app/sw.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(migrated ? await readFile('public/app/migrate-sw.js') : `
      self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
      self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
      self.addEventListener('fetch', e => { if(e.request.mode==='navigate') e.respondWith(Promise.resolve(new Response('<h1>Cached old Fala</h1>', {headers:{'Content-Type':'text/html'}}))); });
    `);
  } else if (migrated) { res.writeHead(302, { Location: targetUrl }); res.end(); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<h1>Old Fala</h1>'); }
});
await new Promise(resolve => old.listen(0, '127.0.0.1', resolve));
const oldUrl = `http://127.0.0.1:${old.address().port}/app/`;
const browser = await chromium.launch({ executablePath: process.env.FALA_TEST_CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext(), page = await context.newPage();
  await page.goto(oldUrl);
  await page.evaluate(async () => { await navigator.serviceWorker.register('/app/sw.js'); await navigator.serviceWorker.ready; await caches.open('fala-web-old'); await caches.open('unrelated-cache'); });
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.reload();
  assert.match(await page.textContent('h1'), /Cached old/);
  migrated = true;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.evaluate(async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (!(await navigator.serviceWorker.getRegistration()) && !(await caches.keys()).some(key => key.startsWith('fala-web-'))) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error('Old worker/cache did not retire');
  });
  assert.deepEqual(await page.evaluate(() => caches.keys()), ['unrelated-cache']);
  assert.equal(page.url(), oldUrl, 'Do not interrupt an active draft');
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(oldUrl);
  assert.equal(reopened.url(), targetUrl);
  assert.equal(await reopened.textContent('h1'), 'New Fala origin');
  console.log('PASS: old offline worker unregisters, only Fala caches clear, active page stays, next visit reaches the new origin.');
} finally { await browser.close(); await Promise.all([new Promise(r => old.close(r)), new Promise(r => target.close(r))]); }
