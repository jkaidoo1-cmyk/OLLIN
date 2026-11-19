"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Prefetch cache — page data is fetched once and kept, so opening a page (or
 * reopening the app) renders from memory instead of asking the server again.
 *
 * How it works:
 *   - `warmResource(key, fetcher)` starts a fetch (on login, on layout mount,
 *     on link hover/touch) and caches the RESULT, not just the promise.
 *   - `useResource(key, fetcher)` renders whatever is cached immediately. If
 *     that copy is older than the key's TTL, the fetch still runs in the
 *     background and the page updates when it lands (stale-while-revalidate).
 *   - Entries also live in `sessionStorage`, so a reload, a restored tab or a
 *     PWA relaunch reuses them instead of repeating every request. They die
 *     with the tab, so nothing stale survives into the next day.
 *   - `invalidateResource(key)` drops a key (memory + storage) after a
 *     mutation; `clearResourceCache()` empties everything on login/logout so
 *     one account's lists can never be shown to the next person on a device.
 *
 * Never cache here: attempt submissions and grading, and anything the server
 * decides from the session rather than from the cached payload.
 */

type Fetcher<T> = () => Promise<T>;

interface Entry<T = unknown> {
  data: T;
  at: number; // when the data arrived (ms epoch)
}

const STORE_PREFIX = "ollin:resource:";
/** sessionStorage entry ceiling — a runaway payload should not be persisted. */
const MAX_PERSISTED_BYTES = 120_000;

/** How long a cached copy is trusted without asking the server again. */
const DEFAULT_TTL_MS = 60_000;
const TTL_MS: Record<string, number> = {
  // Lists a student changes themselves change rarely mid-session.
  "my-quizzes": 60_000,
  quizzes: 60_000,
  "saved-quizzes": 5 * 60_000,
  "my-attempts": 30_000,
  // Course catalogues are effectively static per deployment.
  courses: 10 * 60_000,
  // Identity is cheap and must not survive long enough to outlive a logout.
  me: 20_000,
};

/** Keys that identify a person, kept in memory only — never written to disk. */
const MEMORY_ONLY = new Set(["me"]);

const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
/** Bumped on invalidation so a fetch that started earlier can't revive the key. */
const generations = new Map<string, number>();

function ttlFor(key: string): number {
  return TTL_MS[key] ?? DEFAULT_TTL_MS;
}

function isFresh(key: string, at: number): boolean {
  return Date.now() - at < ttlFor(key);
}

function store(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null; // storage disabled (private mode, blocked cookies)
  }
}

function readPersisted<T>(key: string): Entry<T> | null {
  if (MEMORY_ONLY.has(key)) return null;
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(STORE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T> | null;
    if (!parsed || typeof parsed.at !== "number" || parsed.data === undefined) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersisted(key: string, data: unknown, at: number) {
  if (MEMORY_ONLY.has(key)) return;
  const s = store();
  if (!s) return;
  try {
    const raw = JSON.stringify({ data, at });
    if (raw.length > MAX_PERSISTED_BYTES) {
      s.removeItem(STORE_PREFIX + key);
      return;
    }
    s.setItem(STORE_PREFIX + key, raw);
  } catch {
    // Quota exceeded: memory still has the data for this page load.
  }
}

function dropPersisted(key: string) {
  const s = store();
  if (!s) return;
  try {
    s.removeItem(STORE_PREFIX + key);
  } catch {
    /* ignore */
  }
}

/**
 * Read a cached resource without fetching. Returns the data plus its age so a
 * caller can decide whether it needs refreshing.
 */
export function getResource<T>(key: string): Entry<T> | null {
  const cached = memory.get(key);
  if (cached) return cached as Entry<T>;
  const persisted = readPersisted<T>(key);
  if (persisted) {
    memory.set(key, persisted); // hydrate so the rest of the session is in-memory
    return persisted;
  }
  return null;
}

/**
 * Return the resource, fetching only when there is no acceptable cached copy.
 * A fresh entry resolves from cache with no network call at all; a stale one
 * still resolves to server data so awaiting callers see current values.
 */
export function warmResource<T>(key: string, fetcher: Fetcher<T>): Promise<T> {
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const known = getResource<T>(key);
  if (known && isFresh(key, known.at)) return Promise.resolve(known.data);

  const generation = generations.get(key) ?? 0;
  const holder: { promise: Promise<T> | null } = { promise: null };

  const promise = fetcher().then(
    (data) => {
      // Only commit if this is still the current fetch for the key and the key
      // wasn't invalidated while the request was in the air.
      const isCurrent = inflight.get(key) === holder.promise;
      const stillValid = (generations.get(key) ?? 0) === generation;
      if (isCurrent) inflight.delete(key);
      if (isCurrent && stillValid) {
        const at = Date.now();
        memory.set(key, { data, at });
        writePersisted(key, data, at);
      }
      return data;
    },
    (error) => {
      // Allow a retry on the next visit after a failure.
      if (inflight.get(key) === holder.promise) inflight.delete(key);
      throw error;
    }
  );

  holder.promise = promise;
  inflight.set(key, promise);
  return promise;
}

/** Drop one resource after a mutation, in memory and in sessionStorage. */
export function invalidateResource(key: string) {
  generations.set(key, (generations.get(key) ?? 0) + 1);
  inflight.delete(key);
  memory.delete(key);
  dropPersisted(key);
}

/**
 * Drop every cached resource. Called on login and logout: the cache is keyed by
 * resource name, not by user, so without this the next person to sign in on the
 * same tab could see the previous account's quizzes for up to one TTL.
 */
export function clearResourceCache() {
  for (const key of memory.keys()) {
    generations.set(key, (generations.get(key) ?? 0) + 1);
  }
  memory.clear();
  inflight.clear();

  const s = store();
  if (!s) return;
  const stale: string[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const name = s.key(i);
      if (name && name.startsWith(STORE_PREFIX)) stale.push(name);
    }
    for (const name of stale) s.removeItem(name);
  } catch {
    /* ignore */
  }
}

/**
 * Read a cached resource inside a page. Renders the cached copy right away
 * (loading stays false when one exists) and refreshes it in the background
 * when it is older than the key's TTL. `reload` bypasses the cache after a
 * mutation.
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
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    let alive = true;

    // Cache is read here, not during render: the server has no sessionStorage,
    // so a render-time read would make the first client render disagree with
    // the server HTML (hydration mismatch).
    const known = getResource<T>(key);
    if (known) {
      setData(known.data);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const needsNetwork = nonce > 0 || !known || !isFresh(key, known.at);
    if (!needsNetwork) return () => { alive = false; };

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
