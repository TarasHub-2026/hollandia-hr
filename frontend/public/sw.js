// Minimal service worker: enables installability. Deliberately does NOT cache,
// so HR data and sign-in state are never served stale or stored offline.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

// Push alerts for HR (new leave applications). The server sends { title, body }.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Hollandia Leave', {
    body: d.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'leave-application',
    renotify: true,
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow(self.registration.scope);
  }));
});