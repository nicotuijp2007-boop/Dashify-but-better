// Service worker: lets the app start offline. Network first for the app shell (so a new
// deploy is picked up right away), cache as fallback. /api/* is never cached here; the
// app keeps its own copy of the last good response.

const CACHE = "limieten-shell-v2";
const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/lib/cache.js",
  "/lib/contract.js",
  "/lib/errors.js",
  "/lib/format.js",
  "/lib/router.js",
  "/lib/view.js",
  "/lib/netlify.js",
  "/ui/dom.js",
  "/ui/netlify-views.js",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(request.mode === "navigate" ? "/index.html" : request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(request.mode === "navigate" ? "/index.html" : request);
        return cached ?? Response.error();
      }
    })(),
  );
});
