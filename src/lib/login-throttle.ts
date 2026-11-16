/**
 * Login brute-force guard that works across serverless instances.
 *
 * The in-memory limiter in `rate-limit.ts` only counts requests that land on
 * the same warm lambda, so on Vercel an attacker effectively gets one bucket
 * per instance. This guard keeps the in-memory check as the fast path and adds
 * a shared counter built on the existing `audit_log` table (rows are written by
 * the service role, RLS keeps them server-only), so failures recorded by any
 * instance count for every instance.
 *
 * Two dimensions are limited:
 *   - per IP: stops one host spraying many accounts
 *   - per email: stops a distributed spray at one account
 *
 * Everything here is best-effort: if the database is unreachable the in-memory
 * bucket still applies and the request proceeds (a lost counter must not lock
 * every user out of login).
 */
import { createAdminClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const FAILURE_ACTION = "auth.login_failed";
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES_PER_IP = 10;
const MAX_FAILURES_PER_EMAIL = 8;

type Blocked =
  | { blocked: true; retryAfterSeconds: number; message: string }
  | { blocked: false };

const BLOCK_MSG =
  "Too many failed sign-in attempts. Try again in a few minutes.";

function blocked(retryAfterSeconds: number): Blocked {
  return { blocked: true, retryAfterSeconds, message: BLOCK_MSG };
}

async function countFailures(
  column: "ip" | "detail",
  value: string
): Promise<number> {
  const admin = await createAdminClient();
  if (!admin || !value) return 0;
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("action", FAILURE_ACTION)
    .eq(column, value)
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Returns a block decision for this sign-in attempt, or `{ blocked: false }`.
 * Call before verifying credentials so a blocked caller never reaches the
 * password comparison at all.
 */
export async function checkLoginAttempt(
  request: Request,
  email: string
): Promise<Blocked> {
  // Fast per-instance check first — no network round trip when it trips.
  const memory = checkRateLimit(request, "login");
  if (memory.blocked) return memory;

  try {
    const ip = getClientIp(request);
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const [ipFailures, emailFailures] = await Promise.all([
      countFailures("ip", ip === "unknown" ? "" : ip),
      countFailures("detail", normalizedEmail),
    ]);
    if (ipFailures >= MAX_FAILURES_PER_IP || emailFailures >= MAX_FAILURES_PER_EMAIL) {
      return blocked(Math.ceil(WINDOW_MS / 1000));
    }
  } catch {
    /* Shared store unavailable — the in-memory bucket is the fallback. */
  }
  return { blocked: false };
}

/**
 * Record one failed sign-in in the shared store. Never throws: a failure to
 * log must not change the response the caller already decided on.
 */
export async function recordLoginFailure(
  request: Request,
  email: string
): Promise<void> {
  try {
    const admin = await createAdminClient();
    if (!admin) return;
    const ip = getClientIp(request);
    const { error } = await admin.from("audit_log").insert({
      id: `authfail-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      actor_id: null,
      actor_email: null,
      action: FAILURE_ACTION,
      target_type: "auth",
      target_id: null,
      // Lowercased so the per-account count matches regardless of casing.
      detail: String(email || "").trim().toLowerCase().slice(0, 200),
      ip: ip === "unknown" ? null : ip,
    });
    if (error) throw new Error(error.message);
    // Rows older than the window are never counted again; drop them now and
    // then so a burst of bad logins can't grow the table without bound.
    if (Math.random() < 0.05) {
      const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();
      await admin
        .from("audit_log")
        .delete()
        .eq("action", FAILURE_ACTION)
        .lt("created_at", cutoff);
    }
  } catch {
    /* best-effort — the in-memory limiter still counted the failure */
  }
}
