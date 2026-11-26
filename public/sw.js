/*
 * OLLIN service worker — installed app shell + offline study data.
 *
 * Available without a connection:
 *   - the app shell and the dashboard screens the student has opened (the three
 *     quiz views are warmed from the dashboard, along with their router
 *     payloads, so a tap on the bottom nav still opens them);
 *   - read-only GETs for quizzes, courses, saved (test) quizzes and the
 *     student's own attempts + attempt reviews — My attempts and Test quizzes
 *     render their last known contents;
 *   - quiz screens whose paper is saved on the device (see offline-quiz.ts);
 *   - icons, the offline page and build chunks already loaded.
 *
 * Still needs a connection: creating a quiz, and every admin read or write.
 * Taking a quiz does not: the page marks a saved paper locally and queues the
 * result, which is filed through the normal API when the connection returns.
 *
 * Freshness: everything here is network-first. Online, the page always gets the
 * server's answer and the cache is updated behind it; only when the network is
 * unreachable is the stored copy served.
 */

// Bumped whenever the cached page/API shapes change — the activate handler
// deletes every other cache, so a stale shell can't outlive a deployment.
const CACHE = "ollin-v10";

const OFFLINE_URL = "/offline.html";

// Synthetic cache key for React Server Component payloads. They arrive at the
// real route with an ?_rsc= cache-buster, so they are stored under a stable
// path instead of per-URL keys.
const RSC_PREFIX = "/__ollin_rsc";

// Dashboard screens warmed on mount: the quiz views a student opens offline.
const OFFLINE_PAGES = [
  "/dashboard",
  "/dashboard/attempts",
  "/dashboard/test-quizzes",
  "/dashboard/quizzes",
];

// Read-only GETs (matched on pathname, so query variants share the rule).
// Everything else — creation, submissions, admin data — is deliberately absent.
const OFFLINE_API = [
  /^\/api\/auth\/me$/,
  /^\/api\/quizzes$/,
  /^\/api\/courses$/,
  /^\/api\/saved-quizzes$/,
  /^\/api\/my-quizzes$/,
  /^\/api\/attempts$/,
  /^\/api\/attempts\/[^/]+\/review$/,
];

/** Store a copy without letting a storage failure break the response. */
function put(request, response) {
  return caches
    .open(CACHE)
    .then((cache) => cache.put(request, response))
    .catch(() => {});
}

/**
 * Is the stored copy recent enough that warming can skip it?
 * The server's Date header is the age reference; a copy without one counts as
 * stale so it gets refreshed.
 */
async function cachedRecently(key, maxAgeMs) {
  const hit = await caches.match(key, { ignoreVary: true });
  if (!hit) return false;
  const servedAt = Date.parse(hit.headers.get("date") || "");
  return Number.isFinite(servedAt) && Date.now() - servedAt < maxAgeMs;
}

// Warming runs on every dashboard mount, so a recently refreshed entry is left
// alone: without this the same six lists and eight reviews were refetched on
// every navigation.
const WARM_MAX_AGE_MS = 5 * 60_000;
// Reviews of a finished attempt never change, so they are kept far longer.
const REVIEW_MAX_AGE_MS = 6 * 60 * 60_000;

function rscKey(url) {
  return new Request(new URL(RSC_PREFIX + url.pathname, url.origin).toString());
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Individual adds: one missing file must not abort the whole install.
      Promise.all(
        [OFFLINE_URL, "/icon-192.png", "/icon-512.png"].map((path) =>
          cache.add(path).catch(() => {})
        )
      )
    )
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

/**
 * Warm the offline copies while the student is signed in. Triggered by the
 * dashboard layout, so every response here belongs to that session and no
 * private page is fetched at install time (when the worker has no idea who is
 * signed in).
 */
async function warmOfflinePages() {
  const cache = await caches.open(CACHE);

  await Promise.all(
    OFFLINE_PAGES.map(async (path) => {
      const url = new URL(path, self.location.origin);
      const href = url.href;
      try {
        if (!(await cachedRecently(new Request(href), WARM_MAX_AGE_MS))) {
          const page = await fetch(href, { credentials: "same-origin" });
          const type = page.headers.get("content-type") || "";
          if (page.ok && type.includes("text/html")) {
            await cache.put(new Request(href), page.clone());
          }
        }
      } catch {
        /* offline: keep whatever copy we already have */
      }
      try {
        if (!(await cachedRecently(rscKey(url), WARM_MAX_AGE_MS))) {
          const rsc = await fetch(href, {
            credentials: "same-origin",
            headers: { RSC: "1" },
          });
          const type = rsc.headers.get("content-type") || "";
          if (rsc.ok && !type.includes("text/html")) {
            await cache.put(rscKey(url), rsc.clone());
          }
        }
      } catch {
        /* offline */
      }
    })
  );

  // The data those pages read. A cached copy is what makes them render instead
  // of showing an empty state when the network is gone.
  const apiPaths = [
    "/api/auth/me",
    "/api/quizzes",
    "/api/courses",
    "/api/saved-quizzes",
    "/api/my-quizzes",
    "/api/attempts?mine=true",
  ];
  for (const path of apiPaths) {
    try {
      const href = new URL(path, self.location.origin).href;
      if (await cachedRecently(new Request(href), WARM_MAX_AGE_MS)) continue;
      const res = await fetch(href, { credentials: "same-origin" });
      if (res.ok) await cache.put(new Request(href), res.clone());
    } catch {
      return; // lost the connection — the rest of the warm-up would fail too
    }
  }

  // Answer reviews are per attempt. The attempt list says which ones exist;
  // only the most recent handful are warmed so this stays a small job.
  try {
    const listKey = new URL("/api/attempts?mine=true", self.location.origin).href;
    const list = await cache.match(new Request(listKey), { ignoreVary: true });
    if (!list) return;
    const { attempts = [] } = await list.clone().json();
    const recent = attempts.filter((a) => a && a.id && a.answers).slice(0, 8);
    for (const attempt of recent) {
      try {
        const href = new URL(
          `/api/attempts/${encodeURIComponent(attempt.id)}/review`,
          self.location.origin
        ).href;
        if (await cachedRecently(new Request(href), REVIEW_MAX_AGE_MS)) continue;
        const res = await fetch(href, { credentials: "same-origin" });
        if (res.ok) await cache.put(new Request(href), res.clone());
      } catch {
        return; // lost the connection — stop the warm-up
      }
    }
  } catch {
    /* no cached attempt list to follow */
  }
}

/**
 * Keep the quiz screen for one share code, so a quiz saved for offline use
 * opens from the home screen instead of the offline notice. Both link forms
 * are stored: a shared link (no query) and the practice link the Test quizzes
 * list uses.
 */
async function warmQuizPage(code) {
  if (!code) return;
  const cache = await caches.open(CACHE);
  const paths = [
    `/quiz/${encodeURIComponent(code)}`,
    `/quiz/${encodeURIComponent(code)}?practice=1`,
  ];
  for (const path of paths) {
    const url = new URL(path, self.location.origin);
    try {
      const page = await fetch(url.href, { credentials: "same-origin" });
      const type = page.headers.get("content-type") || "";
      if (page.ok && type.includes("text/html")) {
        // The page's own build files must be on the device too: an HTML shell
        // whose chunks are missing cannot render offline. The scripts and
        // styles the HTML points at are stored here as well.
        const html = await page.clone().text();
        await cache.put(new Request(url.href), page.clone());
        const assets = new Set(
          (html.match(/\/_next\/static\/[^"'\s>\\&]+/g) || []).slice(0, 80)
        );
        await Promise.all(
          Array.from(assets).map(async (asset) => {
            try {
              const assetUrl = new URL(asset, self.location.origin).href;
              if (await caches.match(assetUrl, { ignoreVary: true })) return;
              const res = await fetch(assetUrl);
              if (res.ok) await cache.put(new Request(assetUrl), res.clone());
            } catch {
              /* one missing asset must not stop the rest */
            }
          })
        );
      }
    } catch {
      /* offline */
    }
    try {
      const rsc = await fetch(url.href, {
        credentials: "same-origin",
        headers: { RSC: "1" },
      });
      const type = rsc.headers.get("content-type") || "";
      if (rsc.ok && !type.includes("text/html")) {
        await cache.put(rscKey(url), rsc.clone());
      }
    } catch {
      /* offline */
    }
  }
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "warm-offline") {
    event.waitUntil(warmOfflinePages());
  }
  if (event.data && event.data.type === "warm-quiz-page") {
    event.waitUntil(warmQuizPage(event.data.code));
  }
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
      caches.match(request, { ignoreVary: true }).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) put(request, res.clone());
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
          if (res.ok) put(request, res.clone());
          return res;
        })
        .catch(() => caches.match(request, { ignoreVary: true }))
    );
    return;
  }

  // Read-only study data: fresh when the server answers, the last copy when it
  // doesn't. Response bodies (not just the page) are what keep My attempts and
  // Test quizzes populated offline.
  if (OFFLINE_API.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) put(request, res.clone());
          return res;
        })
        .catch(() =>
          caches.match(request, { ignoreVary: true }).then((hit) => hit || Response.error())
        )
    );
    return;
  }

  // Router payloads for client-side navigation. Without these a cached page
  // still exists, but tapping a bottom-nav link offline would fail.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    const key = rscKey(url);
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) put(key, res.clone());
          return res;
        })
        .catch(() => caches.match(key, { ignoreVary: true }).then((hit) => hit || Response.error()))
    );
    return;
  }

  // Pages: network-first, then the copy stored when it last loaded, then the
  // offline page. Never a blank screen.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) put(request, res.clone());
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(request, { ignoreVary: true });
          if (hit) return hit;
          return (
            (await caches.match(OFFLINE_URL)) ||
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
          );
        })
    );
  }
});
