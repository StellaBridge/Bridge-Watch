// Stellar Bridge Watch Service Worker (PWA)
const STATIC_CACHE = "bridge-watch-static-v1";
const DATA_CACHE = "bridge-watch-data-v1";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== DATA_CACHE) {
            return caches.delete(key);
          }
          return Promise.resolve(true);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API Requests (Bridges and Assets health caching)
  if (url.pathname.startsWith("/api/")) {
    if (request.method === "GET") {
      event.respondWith(
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(DATA_CACHE).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(async () => {
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
              const headers = new Headers(cachedResponse.headers);
              headers.set("X-Bridge-Watch-Offline", "true");
              return new Response(cachedResponse.body, {
                status: cachedResponse.status,
                statusText: cachedResponse.statusText,
                headers,
              });
            }

            return new Response(
              JSON.stringify({
                bridges: [],
                assets: [],
                offline: true,
                message: "Offline mode: No cached data available yet for this endpoint.",
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json", "X-Bridge-Watch-Offline": "true" },
              }
            );
          })
      );
      return;
    }

    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      event.respondWith(
        fetch(request.clone()).catch(async (error) => {
          const clientList = await self.clients.matchAll();
          for (const client of clientList) {
            client.postMessage({
              type: "FAILED_MUTATION_OFFLINE",
              url: request.url,
              method: request.method,
            });
          }
          throw error;
        })
      );
      return;
    }
  }

  // Handle Static Asset and Navigation requests
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(request, networkResponse);
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(request).catch(() => {
        if (request.mode === "navigate") {
          return caches.match("/index.html");
        }
        return new Response("Network unavailable", { status: 503 });
      });
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
