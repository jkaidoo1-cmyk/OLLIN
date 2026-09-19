import { NextResponse } from "next/server";

/**
 * Public backend-health endpoint.
 *
 * Tells the client which storage backend is actually serving data so the UI
 * can show an accurate notice instead of a stale "local mode" label:
 *   - "supabase": Supabase is configured AND reachable (persistent, shared)
 *   - "file":     falling back to server-side .ollin-*.json files
 *                 (persistent on a real server; ephemeral on serverless hosts)
 */
export async function GET() {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const client = await createClient();
    if (client) {
      // createClient() already probes availability (and returns null when the
      // backend is restricted/unreachable), so a non-null client means healthy.
      return NextResponse.json({ backend: "supabase" });
    }
  } catch { /* fall through */ }
  return NextResponse.json({ backend: "file" });
}
