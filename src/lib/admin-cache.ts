"use client";

/**
 * Shared cache for admin list data.
 *
 * Tab switches in the admin section unmount the page component, so anything
 * held in component state is thrown away and the next visit refetches. Keeping
 * the rows here means a tab renders instantly from memory (or from
 * sessionStorage after a browser reload) and only hits the network when the
 * cache is cold or the admin presses Refresh.
 *
 * sessionStorage, not localStorage: the data is per tab and dies with it, so a
 * stale list can never be served a day later.
 */

type Entry = { data: unknown; at: number };

const store = new Map<string, Entry>();
const PREFIX = "ollin_admin_cache:";

function hydrate(key: string): Entry | null {
  const hit = store.get(key);
  if (hit) return hit;
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry;
    if (!parsed || !Array.isArray(parsed.data)) return null;
    store.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function readCache<T>(key: string): { data: T[]; at: number } | null {
  const entry = hydrate(key);
  return entry ? { data: entry.data as T[], at: entry.at } : null;
}

export function writeCache<T>(key: string, data: T[]): void {
  const entry: Entry = { data, at: Date.now() };
  store.set(key, entry);
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /* quota or private mode — in-memory copy still works */
  }
}

export function clearCache(key: string): void {
  store.delete(key);
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
