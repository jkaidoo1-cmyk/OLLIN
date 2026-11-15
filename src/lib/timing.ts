/**
 * Request timing marks, emitted as a `Server-Timing` header.
 *
 * Every Supabase round trip from a Vercel function has measured 0.5-2.5s, so a
 * route that makes three of them in sequence spends seconds. Without a
 * breakdown there is no way to tell a slow database call from a cold start or
 * from our own code, so each hot route marks its steps and the browser network
 * panel (or `curl -D-`) shows exactly where the time went.
 */

export interface TimingMark {
  name: string;
  ms: number;
}

export function startMarks(): TimingMark[] {
  return [];
}

/** Record how long `fn` took under `name`, then return its result. */
export async function timed<T>(marks: TimingMark[], name: string, fn: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await fn();
  } finally {
    marks.push({ name, ms: Math.round(performance.now() - started) });
  }
}

export function timingHeaders(marks: TimingMark[]): Record<string, string> {
  if (marks.length === 0) return {};
  return {
    "Server-Timing": marks.map((m) => `${m.name};dur=${m.ms}`).join(", "),
  };
}
