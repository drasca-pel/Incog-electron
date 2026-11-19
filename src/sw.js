/* Offline application shell. The simulator and saved projects run locally. */
const CACHE = 'incog-electric-lab-v2';
const CORE = [
  './', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './css/style.css',
  './js/app.js', './js/core/util.js', './js/core/linalg.js', './js/core/components.js',
  './js/core/circuit.js', './js/core/netlist.js', './js/core/solver.js', './js/core/analysis.js',
  './js/core/theorems.js', './js/core/examples.js', './js/ui/editor.js', './js/ui/plot.js',
  './js/ui/tabs.js', './js/ui/properties.js', './js/ui/answers.js', './js/ui/theorems-ui.js',
  './js/ui/scope.js', './js/fields/physics.js', './js/fields/fieldlab.js', './js/ui/panels.js',
  './js/ui/updates.js', './js/ui/manual.js'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(req).then((cached) => cached || fetch(req).then((response) => {
    if (response && response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(req, copy)); }
    return response;
  }).catch(() => caches.match('./index.html'))));
});
