// [MODULE] sw | Service worker: precache the whole app so the installed PWA runs with no network
// [IFACE] layer: infrastructure | in: install/activate/fetch events -> out: cached responses | crosses: [Cache Storage API]
// [GRAPH] needs: [] | feeds: [app] | group: infrastructure
// [STATE] stateful | persists: Cache Storage bucket kana-srs-v1 | raises: nothing

/**
 * Cache-first for everything, because the app is a fixed set of static files
 * with no server state at all -- progress lives in localStorage, never here.
 *
 * BUMP CACHE_NAME on every release, otherwise tablets keep serving the old
 * bundle forever: cache-first never revalidates.
 */
var CACHE_NAME = 'kana-srs-v1';

var ASSETS = [
  './',
  'index.html',
  'css/app.css',
  'js/kana-data.js',
  'js/srs.js',
  'js/storage.js',
  'js/app.js',
  'manifest.webmanifest',
  'icon.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        return name === CACHE_NAME ? null : caches.delete(name);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(function (hit) {
      return hit || fetch(event.request).catch(function () {
        return caches.match('index.html');
      });
    })
  );
});
