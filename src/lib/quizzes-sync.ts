"use client";

import { getResource, warmResource } from "./prefetch";
import { fetchListDelta, mergeList } from "./list-sync";
import { getLocalQuizzes, isLocalMode } from "./local";
import { Course, Quiz } from "./types";

/**
 * Quiz lists, cache first and delta refreshed.
 *
 * Every quiz screen (Test quizzes, My quizzes, the dashboard, attempt titles,
 * the admin list) reads through these loaders, so they all share one cached
 * entry and one in-flight request. Opening a tab renders the cached rows at
 * once; the network is asked only what changed since the last sync.
 */

const QUIZZES_KEY = "quizzes";
const MY_QUIZZES_KEY = "my-quizzes";

/**
 * Loopback file mode keeps extra quizzes in this browser that the server has
 * never seen. A delta would classify them as deleted, so local mode asks for
 * the whole list and merges them back in.
 */
async function syncLocalQuizzes(cached: Quiz[]): Promise<Quiz[]> {
  try {
    const res = await fetch("/api/quizzes", { headers: { "x-local-mode": "true" } });
    if (!res.ok) return cached;
    const data = await res.json();
    const server: Quiz[] = data.quizzes || [];
    const ids = new Set(server.map((q) => q.id));
    return [...server, ...getLocalQuizzes().filter((q) => !ids.has(q.id))];
  } catch {
    return cached;
  }
}

async function syncQuizzes(): Promise<Quiz[]> {
  const entry = getResource<Quiz[]>(QUIZZES_KEY);
  const cached = entry?.data ?? [];
  if (isLocalMode()) return syncLocalQuizzes(cached);

  const delta = await fetchListDelta<Quiz>("/api/quizzes/delta", cached, entry?.at ?? null);
  return mergeList(cached, delta);
}

/** Cached list immediately; one delta request behind it when stale. */
export function loadQuizzes(): Promise<Quiz[]> {
  return warmResource<Quiz[]>(QUIZZES_KEY, syncQuizzes).catch(
    () => getResource<Quiz[]>(QUIZZES_KEY)?.data ?? []
  );
}

/** Same treatment for "My quizzes", which also carries the course list. */
export function loadMyQuizzes(): Promise<{ quizzes: Quiz[]; courses: Course[] }> {
  return warmResource<{ quizzes: Quiz[]; courses: Course[] }>(MY_QUIZZES_KEY, async () => {
    const entry = getResource<{ quizzes: Quiz[]; courses: Course[] }>(MY_QUIZZES_KEY);
    const cached = entry?.data;

    if (isLocalMode()) {
      // Local-mode rows live in this browser as well; ask for the full set.
      try {
        const res = await fetch("/api/my-quizzes", { headers: { "x-local-mode": "true" } });
        if (!res.ok) return cached ?? { quizzes: [], courses: [] };
        const data = await res.json();
        return {
          quizzes: data.quizzes || [],
          courses: data.courses || cached?.courses || [],
        };
      } catch {
        return cached ?? { quizzes: [], courses: [] };
      }
    }

    const known = cached?.quizzes ?? [];
    const delta = await fetchListDelta<Quiz>("/api/my-quizzes/delta", known, entry?.at ?? null);
    return {
      quizzes: mergeList(known, delta),
      courses: (delta.courses as Course[] | undefined) ?? cached?.courses ?? [],
    };
  }).catch((error) => {
    // Offline or a slow server: the cached list is the answer. With nothing
    // cached there is no answer, so the page keeps its own signed-out handling.
    const cached = getResource<{ quizzes: Quiz[]; courses: Course[] }>(MY_QUIZZES_KEY)?.data;
    if (cached) return cached;
    throw error;
  });
}
