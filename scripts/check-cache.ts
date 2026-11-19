/**
 * Checks the resource cache that keeps dashboard lists from being refetched on
 * every visit.
 *
 * The claims worth measuring, in the order they matter:
 *   - a fresh entry costs zero network calls (that is the whole point);
 *   - an expired entry still refreshes exactly once, and the awaiting caller
 *     sees the new data;
 *   - concurrent warms share a single request;
 *   - invalidation forces a refetch, and a fetch that was in flight when the
 *     key was dropped cannot write its stale payload back;
 *   - a failed fetch is not cached;
 *   - entries survive a reload through sessionStorage, except identity.
 *
 * Run: npm run check:cache
 */

// A fake sessionStorage has to exist before any cache call, because the module
// reads window.sessionStorage lazily but both tests and persistence need it.
class FakeStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number): string | null {
    return Array.from(this.map.keys())[i] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  raw(k: string): string | null {
    return this.getItem(k);
  }
}

const fakeStorage = new FakeStorage();
(globalThis as unknown as { window: unknown }).window = {
  sessionStorage: fakeStorage as unknown as Storage,
};

const realNow = Date.now;
let clockSkew = 0;
Date.now = () => realNow() + clockSkew;

const { warmResource, invalidateResource, clearResourceCache, getResource } = await import(
  "../src/lib/prefetch.ts"
);

let checks = 0;
let failures = 0;

function eq(label: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`✗ ${label}\n    expected ${e}\n    actual   ${a}`);
  }
}

function ok(label: string, condition: boolean, detail = "") {
  checks++;
  if (!condition) {
    failures++;
    console.error(`✗ ${label} ${detail}`);
  }
}

const STORE_PREFIX = "ollin:resource:";

// ── 1. A fresh entry costs no network ───────────────────────────────────────
{
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return { n: 1 };
  };
  const first = await warmResource("t-fresh", fetcher);
  const second = await warmResource("t-fresh", fetcher);
  eq("fresh: first warm fetches once", calls, 1);
  eq("fresh: second warm adds no request", calls, 1);
  eq("fresh: both calls see the same data", [first, second], [{ n: 1 }, { n: 1 }]);
}

// ── 2. Concurrent warms share one request ───────────────────────────────────
{
  let calls = 0;
  let release: (v: { n: number }) => void = () => {};
  const slow = () => {
    calls++;
    return new Promise<{ n: number }>((resolve) => {
      release = resolve;
    });
  };
  const a = warmResource("t-dedupe", slow);
  const b = warmResource("t-dedupe", slow);
  const c = warmResource("t-dedupe", slow);
  eq("dedupe: three concurrent warms make one request", calls, 1);
  release({ n: 2 });
  eq("dedupe: all callers get the one result", (await Promise.all([a, b, c])).map((r) => r.n), [2, 2, 2]);
}

// ── 3. An expired entry refreshes once and the caller sees new data ─────────
{
  let calls = 0;
  const fetcher = async () => ({ version: ++calls });
  await warmResource("t-ttl", fetcher);
  eq("ttl: populated once", calls, 1);

  clockSkew += 61_000; // past the 60s default TTL
  const refreshed = await warmResource("t-ttl", fetcher);
  eq("ttl: expiry triggers exactly one refresh", calls, 2);
  eq("ttl: the awaiting caller receives the new value", refreshed, { version: 2 });

  const third = await warmResource("t-ttl", fetcher);
  eq("ttl: refreshed data is then served from cache", calls, 2);
  eq("ttl: cached value is the refreshed one", third, { version: 2 });
  clockSkew = 0;
}

// ── 4. Invalidation forces a refetch ────────────────────────────────────────
{
  let calls = 0;
  const fetcher = async () => ({ v: ++calls });
  await warmResource("t-invalidate", fetcher);
  invalidateResource("t-invalidate");
  await warmResource("t-invalidate", fetcher);
  eq("invalidate: next read refetches", calls, 2);
}

// ── 5. A fetch invalidated mid-flight cannot revive the key ─────────────────
{
  let calls = 0;
  let release: (v: { v: number }) => void = () => {};
  const slow = () => {
    calls++;
    return new Promise<{ v: number }>((resolve) => {
      release = resolve;
    });
  };
  const pending = warmResource("t-race", slow);
  invalidateResource("t-race"); // e.g. the student published a quiz meanwhile
  release({ v: 99 });
  await pending;
  eq("race: the stale fetch really ran", calls, 1);
  eq("race: dropped key is not repopulated by the stale response", getResource("t-race"), null);

  let fresh = 0;
  await warmResource("t-race", async () => ({ v: ++fresh }));
  eq("race: next read performs a real request", fresh, 1);
}

// ── 6. Failures are not cached ──────────────────────────────────────────────
{
  let calls = 0;
  const failing = async () => {
    calls++;
    throw new Error("offline");
  };
  let threw = false;
  try {
    await warmResource("t-fail", failing);
  } catch {
    threw = true;
  }
  ok("failure: the error reaches the caller", threw);
  await warmResource("t-fail", async () => {
    calls++;
    return { recovered: true };
  });
  eq("failure: the next read retries instead of serving a failure", calls, 2);
}

// ── 7. Entries survive a reload through sessionStorage ──────────────────────
{
  await warmResource("t-persist", async () => ({ list: [1, 2, 3] }));
  const stored = fakeStorage.raw(STORE_PREFIX + "t-persist");
  ok("persist: the entry is written to storage", !!stored);

  // Simulate a reload: memory is dropped, storage is not.
  const saved = stored!;
  clearResourceCache();
  eq("persist: clearing wipes stored entries", fakeStorage.raw(STORE_PREFIX + "t-persist"), null);

  fakeStorage.setItem(STORE_PREFIX + "t-persist", saved);
  const hydrated = getResource<{ list: number[] }>("t-persist");
  eq("persist: a reload rehydrates from storage", hydrated?.data, { list: [1, 2, 3] });
}

// ── 8. Identity is never written to storage ────────────────────────────────
{
  await warmResource("me", async () => ({ id: "user-1" }));
  eq("identity: me is not persisted", fakeStorage.raw(STORE_PREFIX + "me"), null);
  eq("identity: me is still cached in memory", getResource<{ id: string }>("me")?.data, { id: "user-1" });
}

// ── 9. An oversized payload is not persisted ───────────────────────────────
{
  await warmResource("t-big", async () => ({ blob: "x".repeat(200_000) }));
  eq("size: oversized payload skipped", fakeStorage.raw(STORE_PREFIX + "t-big"), null);
  ok("size: oversized payload still served from memory", !!getResource("t-big"));
}

// ── 10. Clearing drops every key ───────────────────────────────────────────
{
  await warmResource("t-clear-a", async () => 1);
  await warmResource("t-clear-b", async () => 2);
  clearResourceCache();
  eq("clear: memory is empty", [getResource("t-clear-a"), getResource("t-clear-b")], [null, null]);
  eq("clear: storage is empty", fakeStorage.length, 0);
}

console.log(
  failures === 0
    ? `✓ cache: ${checks} assertions passed`
    : `✗ cache: ${failures} of ${checks} assertions failed`
);
process.exit(failures === 0 ? 0 : 1);
