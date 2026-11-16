import { NextResponse } from "next/server";

/**
 * Storage-health endpoint used by the dashboard banner.
 *
 * It answers one question — "will what I save actually be kept?" — and returns
 * only that boolean. Naming the backend (supabase / file mode) was a free map
 * of the deployment for anyone probing the site, and no client code needs it.
 */
export async function GET() {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const client = await createClient();
    // createClient() already probes availability (and returns null when the
    // backend is restricted/unreachable), so a non-null client means the data
    // is stored in the shared, persistent database.
    if (client) return NextResponse.json({ persistent: true });
  } catch { /* fall through */ }
  return NextResponse.json({ persistent: false });
}
