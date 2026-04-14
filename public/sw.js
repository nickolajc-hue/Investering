const CACHE_NAME = 'aktier-v1';

self.addEventListener('install', (evt) => {
  evt.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add('/')));
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  const url = new URL(evt.request.url);

  // Never cache API calls — always fetch fresh news
  if (url.pathname.startsWith('/api/')) return;

  evt.respondWith(
    fetch(evt.request)
      .then((res) => {
        if (res.ok && evt.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(evt.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(evt.request).then((cached) => cached || caches.match('/'))
      )
  );
});
