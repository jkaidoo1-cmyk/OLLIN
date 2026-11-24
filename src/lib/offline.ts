"use client";

/**
 * Offline support helpers.
 *
 * The service worker (public/sw.js) owns the cached copies of the dashboard
 * screens and the read-only quiz/attempt APIs. These helpers only ask it to
 * refresh that cache, and drop it when the device changes hands.
 */

/** Ask the worker to store the dashboard screens and their data for offline use. */
export function warmOfflinePages(): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (navigator.onLine === false) return; // nothing to fetch
  navigator.serviceWorker.ready
    .then((registration) => {
      const worker = registration.active || navigator.serviceWorker.controller;
      worker?.postMessage({ type: "warm-offline" });
    })
    .catch(() => {
      /* no worker (dev server, unsupported browser) — online behaviour is unchanged */
    });
}

/**
 * Delete every offline copy this app keeps.
 *
 * Called on login and logout: the cache is per origin, not per user, so
 * without this the next person to sign in on the same device could open a
 * cached page of the previous account's quizzes and attempts. The worker
 * refills it on the next dashboard visit.
 */
export async function clearOfflineData(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  } catch {
    /* storage unavailable — nothing was stored either */
  }
}
