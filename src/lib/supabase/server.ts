import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Backend availability probe.
 *
 * Credentials being present does not mean the project is usable — Supabase
 * restricts projects that exceed quotas (e.g. `exceed_egress_quota`) and
 * network failures happen. When the backend is unreachable, callers should
 * fall back to file-backed storage instead of surfacing raw errors, so we
 * probe cheaply and cache the result briefly.
 */
let availability: { ok: boolean; at: number } | null = null;
const AVAILABILITY_TTL_MS = 60_000;

function looksLikeBackendFailure(message: string): boolean {
  const m = String(message).toLowerCase();
  return (
    m.includes("restricted") ||
    m.includes("violation") ||
    m.includes("fetch failed") ||
    m.includes("failed to fetch") ||
    m.includes("enotfound") ||
    m.includes("econnrefused") ||
    m.includes("etimedout") ||
    m.includes("network error")
  );
}

async function isBackendAvailable(client: ReturnType<typeof createServerClient>): Promise<boolean> {
  const now = Date.now();
  if (availability && now - availability.at < AVAILABILITY_TTL_MS) {
    return availability.ok;
  }
  try {
    // Any response (even an RLS/permission error) means the backend is up;
    // only availability-type failures count as "down".
    const { error } = await client.from("profiles").select("id").limit(1);
    availability = { ok: !error || !looksLikeBackendFailure(error.message), at: now };
  } catch {
    availability = { ok: false, at: now };
  }
  return availability.ok;
}
export async function createClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null as any;
  }

  const cookieStore = await cookies();

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            );
          } catch {
            // Called from a Server Component — ignore
          }
        },
      },
    }
  );

  // Configured but unreachable/restricted → treat as no backend so callers
  // fall back to file mode instead of leaking raw restriction errors.
  if (!(await isBackendAvailable(client))) {
    return null as any;
  }
  return client;
}

/**
 * Admin client with service role key — use only in API routes for server-side ops
 */
export async function createAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null as any;
  }

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {},
      },
    }
  );

  if (!(await isBackendAvailable(client))) {
    return null as any;
  }
  return client;
}
