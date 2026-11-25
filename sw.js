/* Donjon Arena 3D — service worker (PWA / application Android)
   - page (index.html) : réseau d'abord, cache si hors ligne
   - scripts, styles, icônes (versionnés ?v=) et three.js : cache d'abord
   - Firebase / Google : jamais mis en cache (connexion, base de données temps réel) */
const CACHE = 'donjon-arena-v20261125n';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const NEVER = /firebase|googleapis|gstatic\.com\/firebasejs|firebaseio|identitytoolkit|securetoken|accounts\.google/;
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  if (NEVER.test(url)) return;                                   // laisse passer tel quel
  const sameOrigin = url.startsWith(self.location.origin);
  const isPage = req.mode === 'navigate' || (sameOrigin && /\/(index\.html)?(\?.*)?$/.test(new URL(url).pathname + new URL(url).search));
  if (isPage) {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put('./index.html', cp)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  if (sameOrigin || /cdnjs\.cloudflare\.com/.test(url)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
      return r;
    })));
  }
});
