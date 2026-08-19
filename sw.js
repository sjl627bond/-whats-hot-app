const CACHE_NAME = 'gohott-shell-ios-2';
const APP_SHELL = ['./', './index.html', './offline.html', './privacy.html', './terms.html', './support.html', './privacy-choices.html', './styles.css', './mobile.css', './legal.css', './config.js', './native-runtime.js', './mobile.js', './observability.js', './live-look.js', './social.js', './supabase.js', './auth.js', './geo.js', './ranking.js', './map.js', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  // Network-first keeps releases fresh; the cache is only a resilient fallback.
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('network timeout')), 8000));
  event.respondWith(Promise.race([fetch(event.request), timeout]).then((response) => {
    const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === 'navigate' ? caches.match('./offline.html') : Response.error()))));
});
