// Historical migration worker fixture; no longer served after the old origin was disabled.
// Release that origin's offline shell without navigating an active draft.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('fala-web-')) await caches.delete(key);
  await self.registration.unregister();
})()));
