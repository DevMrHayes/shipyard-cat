// Immediate self-cleanup service worker for local development
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister().then(() => {
      return self.clients.matchAll();
    }).then((clients) => {
      // Release control of all clients
      clients.forEach((client) => {
        if (client.navigate && client.url) {
          client.navigate(client.url);
        }
      });
    })
  );
});

// Pass-through fetch with zero interception
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});