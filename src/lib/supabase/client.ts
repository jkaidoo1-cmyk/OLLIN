"use client";

// Supabase browser client.
// Returns null when env vars are not configured — all callers must guard.
// When env vars ARE set, lazily creates a singleton client.

let _client: any = null;

export function createClient(): any {
  if (typeof window === "undefined") return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  if (!_client) {
    // Dynamic import avoids Turbopack build-time bundling of @supabase/ssr
    // when env vars are not set (e.g. on Vercel without Supabase configured).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ssr = require("@supabase/ssr");
    _client = ssr.createBrowserClient(url, key);
  }
  return _client;
}
