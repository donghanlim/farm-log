const CACHE = 'farmlog-farmer-shell-v2';
const SHELL = ['./', './index.html', './app.js', './speech-local.js', './style.css', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const base = new URL(self.registration.scope);
  if (event.request.method !== 'GET' || url.origin !== base.origin || url.pathname.includes('/api/')) return;
  const allowed = SHELL.map(item => new URL(item, base).pathname);
  if (!allowed.includes(url.pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
    return response;
  }).catch(() => caches.match(event.request)));
});
