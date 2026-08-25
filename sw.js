const CACHE = 'foundry-v3';
const CORE = ['./', 'index.html', 'sync.js', 'firebase-config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
});

// The page decides when to activate a new version (see the update toast).
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Never cache Firestore/Auth traffic — it has its own offline layer.
  const url = new URL(req.url);
  if (/firestore\.googleapis|identitytoolkit|googleapis\.com\/google\.firestore/.test(url.host + url.pathname)) return;

  // App shell: network first so a deployed update lands, cache as offline fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        caches.open(CACHE).then(c => c.put('index.html', res.clone()));
        return res;
      }).catch(() => caches.match('index.html'))
    );
    return;
  }

  // Everything else (fonts included): cache first, then fill the cache.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        caches.open(CACHE).then(c => c.put(req, res.clone()));
      }
      return res;
    }).catch(() => hit))
  );
});
