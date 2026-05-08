const CACHE_NAME = "relative-alert-v01-cache";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./presets.js",
  "./manifest.webmanifest",
  "./icons/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(
      ASSETS.map(async (asset) => {
        try {
          await cache.add(asset);
        } catch (error) {
          console.warn("[sw] cache add failed:", asset, error);
        }
      })
    );
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((res) => {
          if (!res || res.status !== 200 || res.type !== "basic") return res;

          const copy = res.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, copy).catch((error) => {
              console.warn("[sw] cache put failed:", request.url, error);
            });
          });

          return res;
        })
        .catch(() => {
          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }

          throw new Error("Network error and no cache for non-navigation request");
        });
    })
  );
});
