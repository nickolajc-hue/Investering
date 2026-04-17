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

// ── Push notifications ────────────────────────────────────────────────────────

self.addEventListener('push', (evt) => {
  if (!evt.data) return;
  let payload;
  try { payload = evt.data.json(); } catch { return; }

  evt.waitUntil(
    self.registration.showNotification(payload.title || 'Ny nyhed', {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'aktie-nyhed',        // replace older notification with same tag
      renotify: true,
      data: { url: payload.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (evt) => {
  evt.notification.close();
  const target = evt.notification.data?.url || '/';
  evt.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          client.focus();
          client.postMessage({ type: 'OPEN_NEWS', url: target });
          return;
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow('/?tab=nyheder');
    })
  );
});
