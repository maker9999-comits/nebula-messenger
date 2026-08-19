self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data.json(); } catch (err) {}
  const title = String(data.title || 'Nebula').slice(0, 80);
  const options = {
    body: String(data.body || '').slice(0, 220),
    icon: 'icon-192.png',
    badge: 'icon-96.png',
    tag: String(data.tag || 'nebula').slice(0, 64),
    renotify: true,
    vibrate: [200, 100, 200, 100, 200],
    silent: false,
    data: { url: String(data.url || '/').slice(0, 400) },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if ('focus' in c) { c.focus(); if (c.navigate) c.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});

self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil(self.registration.pushManager.getSubscription().then(s => s).catch(() => null));
});