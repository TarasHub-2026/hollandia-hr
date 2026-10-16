// Minimal service worker: enables installability. Deliberately does NOT cache,
// so HR data and sign-in state are never served stale or stored offline.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});