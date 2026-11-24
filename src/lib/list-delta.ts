/**
 * Delta ("what changed since last time") helpers for list endpoints.
 *
 * The client sends the ids it already holds plus the server time of its last
 * sync. The server answers with only the rows that are new or edited, and the
 * ids that no longer exist — so an admin adding one quiz costs one small row
 * instead of the whole catalogue.
 *
 * Removals cannot be inferred from timestamps (a deleted row leaves no trace),
 * which is why the client's own id list is part of the request. Without it the
 * response is simply the full list.
 */

export interface Syncable {
  id: string;
  updated_at?: string | null;
  created_at?: string | null;
}

/** The version stamp that decides whether a cached copy is stale. */
export function rowVersion(row: Syncable): string {
  return String(row.updated_at || row.created_at || "");
}

/** Parse the `known` query param: ids the client already has. */
export function parseKnownIds(raw: string | null, max = 500): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (id && id.length <= 120) seen.add(id);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** Parse `since`: the server time the client last synced at. */
export function parseSince(raw: string | null): string | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export interface ListDelta<T> {
  /** Rows the client should insert or replace. */
  changed: T[];
  /** Ids the client held that the server no longer lists. */
  removed: string[];
  /** How many known rows were untouched (handy when debugging a slow list). */
  unchanged: number;
  /** True when `changed` is the whole list, so the client must replace. */
  full: boolean;
}

export function diffRows<T extends Syncable>(
  current: T[],
  knownIds: string[],
  since: string | null
): ListDelta<T> {
  const known = new Set(knownIds);
  const currentIds = new Set(current.map((row) => row.id));

  const changed = since
    ? current.filter((row) => {
        if (!known.has(row.id)) return true; // new to this client
        const version = rowVersion(row);
        // No timestamp on either side: nothing says it changed, so leave it.
        return version !== "" && version > since;
      })
    : current;

  const removed = since ? knownIds.filter((id) => !currentIds.has(id)) : [];

  return {
    changed,
    removed,
    unchanged: current.length - changed.length,
    full: !since,
  };
}
