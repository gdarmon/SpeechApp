const CACHE = 'fala-web-0.13.5';
const SHELL = ['/app/', '/app/index.html', '/app/app.css', '/app/app.js', '/app/api.js', '/app/voice.js', '/app/walkthrough.js', '/app/rewards.js', '/app/partners.js', '/app/instructors/bananera.png', '/app/instructors/bateba.png', '/app/instructors/vesoura.png', '/app/manifest.webmanifest', '/logo.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('fala-web-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never cache sign-in, audio, API replies, transcripts, or account data.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !SHELL.includes(url.pathname) || url.search) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); }
    return response;
  }).catch(async () => (await caches.match(event.request)) || Response.error()));
});
self.addEventListener('push',event=>{
  let message;try{message=event.data?.json();}catch{return;}
  if(!message)return;
  event.waitUntil(self.registration.showNotification(String(message.title||'Fala').slice(0,100),{body:String(message.body||'Time for a little Portuguese.').slice(0,240),icon:'/logo.png',badge:'/logo.png',tag:String(message.tag||'fala-practice'),data:{url:'/app/'}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
    const client=windows.find(c=>new URL(c.url).origin===self.location.origin&&new URL(c.url).pathname.startsWith('/app/'));
    if(client)return client.focus();return self.clients.openWindow('/app/');
  }));
});
