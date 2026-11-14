/*
 * OLLIN service worker — installed app shell + offline fallback.
 *
 * Strategy:
 *   - Network-first for pages and API calls (quiz scores and question data
 *     must be fresh); falls back to the cached offline page when unreachable.
 *   - Cache-first for static assets (icons, fonts, static chunks) — they are
 *     content-addressed, so a stale hit is effectively impossible.
 *
 * Deliberately minimal: quiz data is NOT cached for offline quiz-taking,
 * because grading is server-side and an offline submission would silently
 * vanish. Offline users see the offline page instead of a broken quiz.
 */

// Bumped with offline.html: the offline page is precached, so a stale cache
// would keep serving the version without the retry states.
const CACHE = "ollin-v8";

// New logo mark — bumping the cache so browsers can't serve the old assets.
const LOGO_URLS = ["/logo-ink.png", "/logo.png", "/icon-192.png", "/icon-512.png", "/icon-maskable.png", "/favicon.ico", "/logo-mark.svg"];
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png", "/icon-512.png"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Icons and the logo have fixed names, so a cached copy can never be a
  // different file. Cache-first is safe here.
  if (url.pathname.startsWith("/icon-") || url.pathname === "/logo.png") {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // Build chunks: network-first, NOT cache-first. Dev chunk names are stable
  // rather than content-hashed, so serving a cached copy after a rebuild hands
  // the page an old module graph and Next fails with "module factory is not
  // available" — half-loaded pages with stale data.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Everything else (pages, API): network-first, offline fallback for navigations
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && request.mode === "navigate") {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() =>
        request.mode === "navigate"
          ? caches.match(OFFLINE_URL).then((hit) => hit || new Response("Offline", { status: 503 }))
          : Response.error()
      )
  );
});
