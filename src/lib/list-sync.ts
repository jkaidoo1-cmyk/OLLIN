"use client";

/**
 * Client side of the list delta endpoints (/api/quizzes/delta,
 * /api/my-quizzes/delta).
 *
 * The cache stays authoritative: open a page and the cached rows render
 * immediately, while one request asks the server what changed. Nothing here
 * fetches a list it already has.
 */

/** More ids than this and the request URL gets unwieldy — ask for the full list. */
export const MAX_KNOWN_IDS = 200;

export interface DeltaFetch<T> {
  /** Rows to insert or replace. */
  changed: T[];
  /** Ids the server no longer lists. */
  removed: string[];
  /** True when `changed` is the whole list. */
  full: boolean;
  /** Server time of this sync, for the next request's `since`. */
  syncedAt: number | null;
  /** Endpoints that bundle a catalogue (my-quizzes) pass it through. */
  courses?: unknown;
}

/**
 * Ask one delta endpoint what changed. When there is nothing to compare
 * against the request degrades to a plain list fetch.
 */
export async function fetchListDelta<T extends { id: string }>(
  endpoint: string,
  known: T[],
  syncedAt: number | null,
  headers: Record<string, string> = {}
): Promise<DeltaFetch<T>> {
  const params = new URLSearchParams();
  if (known.length > 0 && known.length <= MAX_KNOWN_IDS && syncedAt != null) {
    params.set("known", known.map((row) => row.id).join(","));
    params.set("since", new Date(syncedAt).toISOString());
  }
  const query = params.toString();

  const res = await fetch(query ? `${endpoint}?${query}` : endpoint, { headers });
  if (res.status === 401) throw new Error("Please sign in again.");
  if (!res.ok) throw new Error(`delta ${res.status}`);
  const payload = await res.json();

  return {
    changed: payload.quizzes || [],
    removed: payload.removed || [],
    full: payload.delta === false,
    syncedAt: payload.synced_at ? Date.parse(payload.synced_at) : Date.now(),
    courses: payload.courses,
  };
}

/** Apply a delta to the rows on screen (or in the cache). */
export function mergeList<T extends { id: string }>(current: T[], delta: DeltaFetch<T>): T[] {
  if (delta.full) return delta.changed;
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const row of delta.changed) byId.set(row.id, row);
  for (const id of delta.removed) byId.delete(id);
  return [...byId.values()];
}
