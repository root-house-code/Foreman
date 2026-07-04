// Foreman service worker — makes the app installable and fast to load.
//
// Strategy:
//  - /api/* is NEVER intercepted: reads/writes and the SSE live-update stream
//    must always hit the host directly (data freshness over offline support).
//  - Hashed build assets (/assets/*, images, fonts) are cache-first: their
//    names change on every build, so a cache hit is always correct.
//  - Navigations / index.html are network-first with cache fallback: a fresh
//    deploy is picked up on the next load, and a cached shell still opens the
//    app when the host is briefly unreachable.
//
// Note: service workers only run in secure contexts (HTTPS or localhost).
// Over plain LAN HTTP the registration is skipped by the guard in main.jsx —
// this file is inert there and the app works exactly as before.

const CACHE = "foreman-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // live data — never cached

  const isStaticAsset =
    url.pathname.includes("/assets/") ||
    /\.(png|jpg|svg|ico|woff2?|webmanifest)$/.test(url.pathname);

  if (isStaticAsset) {
    // Cache-first: hashed filenames make stale hits impossible
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      })
    );
  } else {
    // App shell: network-first, cached shell as offline fallback
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(event.request);
          return hit || caches.match("./");
        })
    );
  }
});
