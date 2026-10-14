/* Service worker do aplicativo: permite instalar no celular, abre a última versão salva quando
   a internet falha e mostra as notificações. Os dados sempre vêm do servidor (nada sigiloso fica em cache). */
const CACHE = 'gestao-ms-v2';
const BASICOS = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'logo-ms.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASICOS)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || /\.php$/.test(u.pathname)) return; // API e portal: sempre na rede
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
/* notificação push vinda do servidor (chega mesmo com o sistema fechado) */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { t: 'Gestão do escritório', b: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.t || 'Gestão do escritório', {
    body: d.b || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || undefined, renotify: !!d.tag,
    data: { u: d.u || '' }, vibrate: [120, 60, 120] }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const ir = (e.notification.data && e.notification.data.u) || '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if ('focus' in w) { if (ir) w.postMessage({ ir }); return w.focus(); }
    return self.clients.openWindow('./' + (ir.startsWith('#') ? ir : ''));
  }));
});
