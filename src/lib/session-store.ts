import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * Server-side session registry.
 *
 * Cookies alone can't be revoked — the holder keeps a valid signature until
 * expiry. This store records every issued session id so the server can:
 *   - reject sessions that were revoked ("log out everywhere")
 *   - delete a user's sessions when the admin resets their password
 *
 * Stored per-user: { [userId]: Array<{ sid, issued, exp }> }.
 * The file is a fallback; a `sessions` Supabase table is used when
 * configured. If the store is unreachable, validation fails OPEN (the
 * cookie signature still protects the session) so a lost store can't lock
 * everyone out.
 */

interface SessionRecord {
  sid: string;
  issued: number;
  exp: number;
}

const SESSIONS_PATH = () => join(process.cwd(), ".ollin-sessions.json");

function readFileStore(): Record<string, SessionRecord[]> {
  try {
    if (existsSync(SESSIONS_PATH())) {
      return JSON.parse(readFileSync(SESSIONS_PATH(), "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

function writeFileStore(store: Record<string, SessionRecord[]>) {
  try {
    writeFileSync(SESSIONS_PATH(), JSON.stringify(store, null, 2));
  } catch { /* read-only fs (Vercel) */ }
}

function prune(records: SessionRecord[]): SessionRecord[] {
  const now = Date.now();
  return records.filter((r) => r.exp > now);
}

export async function registerSession(
  userId: string,
  sid: string,
  issued: number,
  exp: number
): Promise<void> {
  // Only use Supabase when it's genuinely reachable — createAdminClient()
  // returns a client whenever env vars exist, but a restricted/unreachable
  // backend would silently drop inserts and break revocation. File-mode
  // user ids (e.g. "admin-001") aren't uuids and would fail the
  // sessions.user_id FK cast, so the file store handles them directly.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(userId)) {
    const store = readFileStore();
    store[userId] = prune([...(store[userId] || []), { sid, issued, exp }]).slice(-20);
    writeFileStore(store);
    return;
  }
  let usedSupabase = false;
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const admin = await createAdminClient();
    if (admin) {
      const { error } = await admin
        .from("sessions")
        .insert({ user_id: userId, sid, issued_at: new Date(issued).toISOString(), expires_at: new Date(exp).toISOString() });
      if (!error) usedSupabase = true;
    }
  } catch { /* fall through to file */ }
  if (usedSupabase) return;
  const store = readFileStore();
  store[userId] = prune([...(store[userId] || []), { sid, issued, exp }]).slice(-20);
  writeFileStore(store);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function isSessionValid(userId: string, sid: string): Promise<boolean> {
  // Prefer the file store when it has a record for this user: it's written
  // on every login unless the Supabase insert provably succeeded, so it is
  // always authoritative in file mode and never silently out of date.
  const store = readFileStore();
  const records = store[userId];
  if (records && records.length > 0) {
    return prune(records).some((r) => r.sid === sid);
  }

  // Non-UUID (built-in/local) users register ONLY in the file store (see
  // registerSession). On an ephemeral filesystem (Vercel) that record is
  // gone, and a Supabase lookup below could never have it — fail open here
  // or every local account would be permanently invalid in production.
  if (!UUID_RE.test(userId)) {
    return true;
  }

  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const admin = await createAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from("sessions")
        .select("sid")
        .eq("user_id", userId)
        .eq("sid", sid)
        .maybeSingle();
      // Store unreachable → fail open (signature is still the real gate)
      if (error) return true;
      return !!data;
    }
  } catch { /* fall through */ }

  // No record anywhere → fail open for pre-existing cookies issued before
  // this registry existed; newly issued sessions always have records.
  return true;
}

export async function revokeSession(userId: string, sid: string): Promise<void> {
  // Always remove from the file store (authoritative in file mode).
  const store = readFileStore();
  if (store[userId]) {
    store[userId] = store[userId].filter((r) => r.sid !== sid);
    writeFileStore(store);
  }
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const admin = await createAdminClient();
    if (admin) {
      await admin.from("sessions").delete().eq("user_id", userId).eq("sid", sid);
    }
  } catch { /* best-effort */ }
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const store = readFileStore();
  const fileCount = (store[userId] || []).length;
  delete store[userId];
  writeFileStore(store);
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const admin = await createAdminClient();
    if (admin) {
      const { data } = await admin.from("sessions").delete().eq("user_id", userId).select("sid");
      return Math.max(fileCount, (data || []).length);
    }
  } catch { /* best-effort */ }
  return fileCount;
}

/** Called when an admin resets a password — force re-login everywhere. */
export async function revokeAllForEmail(email: string): Promise<void> {
  try {
    const { readLocalUsers } = await import("@/lib/local-users-store");
    const user = readLocalUsers().find((u: any) => u.email === String(email).toLowerCase());
    if (user) await revokeAllSessions(user.id);
  } catch { /* best-effort */ }
}
