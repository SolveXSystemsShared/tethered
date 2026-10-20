// Service worker: precache the whole app so same-device play works offline.
// Bump VERSION on every deploy so clients pick up the new files.
const VERSION = 'tethered-v1.1.1';
const ASSETS = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'src/main.js', 'src/config.js', 'src/input.js', 'src/audio.js', 'src/net.js', 'src/ui.js', 'src/save.js', 'src/platform.js',
  'src/render/renderer.js', 'src/render/fx.js',
  'src/sim/game.js', 'src/sim/math.js', 'src/sim/enemies.js', 'src/sim/waves.js', 'src/sim/tutorial.js', 'src/sim/bots.js', 'src/sim/snapshot.js',
  'vendor/peerjs.min.js', 'vendor/qrcode.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // PeerJS broker etc. go straight to the network
  // cache-first for app files; navigation requests fall back to the cached shell
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
