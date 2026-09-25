"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Prefetch cache — page data is warmed before a page opens, so its content
 * renders on first paint instead of skeletons.
 *
 * How it works:
 *   - `warmResource(key, fetcher)` starts the fetch immediately (on login,
 *     on layout mount, on link hover/touch) and caches the promise.
 *   - Pages call `useResource(key, fetcher)`: if the promise is already in
 *     flight, the page awaits it (usually near-instant); otherwise the
 *     fetcher runs and is cached. Either way there is exactly one network
 *     round-trip per resource, shared by every page that needs it.
 *   - `invalidateResource(key)` drops the cache after a mutation, so the
 *     next page visit re-fetches.
 *
 * Skeletons remain the fallback for cold entries (direct URL visits,
 * refreshes) — this layer removes the wait on the common in-app path.
 */

type Fetcher<T> = () => Promise<T>;

interface CacheEntry {
  promise: Promise<unknown>;
  key: string;
}

const cache = new Map<string, CacheEntry>();

export function warmResource<T>(key: string, fetcher: Fetcher<T>): Promise<T> {
  const existing = cache.get(key);
  if (existing && existing.key === key) return existing.promise as Promise<T>;
  const promise = fetcher().catch((err) => {
    cache.delete(key); // allow retry on next visit after a failure
    throw err;
  });
  cache.set(key, { promise, key });
  return promise;
}

export function invalidateResource(key: string) {
  cache.delete(key);
}

/**
 * Read a cached resource inside a page. Returns the data (or null while
 * loading), plus a `reload` that bypasses the cache after mutations.
 */
export function useResource<T>(key: string, fetcher: Fetcher<T>): {
  data: T | null;
  loading: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    warmResource(key, () => fetcherRef.current())
      .then((result) => {
        if (alive) setData(result);
      })
      .catch(() => {
        /* fetcher's own fallbacks handle errors; keep prior data if any */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [key, nonce]);

  const reload = () => {
    invalidateResource(key);
    setNonce((n) => n + 1);
  };

  return { data, loading, reload };
}

/** Fire-and-forget warm-up for a list of resources. */
export function warmAll(entries: Array<[string, Fetcher<unknown>]>) {
  for (const [key, fetcher] of entries) warmResource(key, fetcher);
}
