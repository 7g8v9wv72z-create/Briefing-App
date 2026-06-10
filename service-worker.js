// Service Worker für die Morgen-Briefing PWA
const CACHE = "morgen-briefing-v6";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./manifest.json",
  "./icon.svg",
  "./news.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // API-Aufrufe (TomTom, Open-Meteo) niemals cachen – immer Netzwerk.
  const isApi = /api\.tomtom\.com|open-meteo\.com/.test(url.host);
  if (isApi) return; // Browser-Standardverhalten; bei Offline schlägt der fetch im app.js fehl.

  // news.json und die vorproduzierten Audio-MP3s immer frisch aus dem Netz
  // (mit Cache als Offline-Fallback).
  if (url.origin === self.location.origin &&
      (url.pathname.endsWith("/news.json") || /\/news-[a-z]+\.mp3$/.test(url.pathname))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // App-Shell: cache-first mit Netzwerk-Fallback.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() => {
            // Navigations-Fallback auf die App-Shell.
            if (req.mode === "navigate") return caches.match("./index.html");
          });
      })
    );
  }
});
