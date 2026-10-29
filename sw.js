/* Nailora v8.36 — Web Push service worker. Scope: /Nailora/ */
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('push', event => {
  let payload = { title: 'Nailora', body: 'Новое уведомление в Nailora.', url: '/Nailora/' };
  try { if (event.data) payload = { ...payload, ...event.data.json() }; }
  catch (_) { try { if (event.data) payload.body = event.data.text(); } catch (_) {} }
  const title = String(payload.title || 'Nailora').slice(0, 100);
  const body = String(payload.body || '').slice(0, 500);
  const url = (typeof payload.url === 'string' && payload.url.startsWith('/Nailora/')) ? payload.url : '/Nailora/';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/Nailora/icons/nailora-192.png',
    badge: '/Nailora/icons/nailora-badge-96.png',
    tag: String(payload.tag || 'nailora-notification').slice(0, 100),
    renotify: false,
    data: { url }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const requested = event.notification.data && event.notification.data.url;
  const target = new URL(typeof requested === 'string' && requested.startsWith('/Nailora/') ? requested : '/Nailora/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if (client.url.startsWith(self.location.origin + '/Nailora/')) {
        if ('navigate' in client) client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
