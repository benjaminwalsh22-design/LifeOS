/* LifeOS service worker — push notifications */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { title: 'LifeOS', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'LifeOS', {
    body: d.body || '',
    icon: 'apple-touch-icon.png',
    badge: 'apple-touch-icon.png',
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) { if ('focus' in w) return w.focus(); }
    return clients.openWindow((e.notification.data && e.notification.data.url) || './');
  }));
});
