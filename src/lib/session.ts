/**
 * Server-side session authentication.
 *
 * Login issues an httpOnly, signed cookie. All admin/config API routes verify
 * this cookie server-side — localStorage alone is never trusted for writes.
 */
import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { readLocalUsers } from "./local-users-store";
import { ADMIN_EMAIL } from "./local-constants";

const COOKIE_NAME = "ollin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface SessionPayload {
  userId: string;
  email: string;
  role: string;
  sid: string; // session id — revocable via the session store
  exp: number;
}

// ---------------------------------------------------------------------------
// Secret management — generated once per server, persisted to disk.
// (On Vercel the filesystem is ephemeral; the secret regenerates and old
// sessions are invalidated, which is acceptable and fails safe.)
// ---------------------------------------------------------------------------
let cachedSecret: string | null = null;

function getSessionSecret(): string {
  if (cachedSecret) return cachedSecret;
  // Production: the secret must come from the environment so that every
  // serverless instance signs cookies identically. A per-instance random
  // secret would invalidate sessions on every cold start / different lambda.
  const envSecret = process.env.SESSION_SECRET;
  if (envSecret && envSecret.length >= 32) {
    cachedSecret = envSecret;
    return cachedSecret;
  }
  const secretPath = join(process.cwd(), ".ollin-session-secret");
  try {
    if (existsSync(secretPath)) {
      cachedSecret = readFileSync(secretPath, "utf8").trim();
      if (cachedSecret) return cachedSecret;
    }
  } catch { /* fall through */ }
  cachedSecret = randomBytes(32).toString("hex");
  try {
    writeFileSync(secretPath, cachedSecret, { encoding: "utf8" });
  } catch { /* read-only fs (Vercel) — dev fallback only */ }
  return cachedSecret;
}

function sign(data: string): string {
  return createHmac("sha256", getSessionSecret()).update(data).digest("hex");
}

function serialize(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function deserialize(token: string): SessionPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  // Constant-time comparison to avoid timing attacks.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (!payload.userId || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie handling
// ---------------------------------------------------------------------------
export function createSessionCookie(user: { id: string; email: string; role: string }): string {
  const sid = randomBytes(12).toString("hex");
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: user.role || "student",
    sid,
    exp: Date.now() + SESSION_TTL_MS,
  };
  // Register the session server-side so it can be revoked later. Registration
  // is best-effort: if the store is unreachable the cookie still works (fail
  // open) — the signature remains the primary protection.
  import("./session-store")
    .then(({ registerSession }) => registerSession(user.id, sid, Date.now(), payload.exp))
    .catch(() => { /* best-effort */ });
  // Secure in production only: a Secure cookie is dropped over plain http, and
  // local development runs on http://localhost.
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${serialize(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`;
}

export function createLogoutCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function getSessionFromRequest(request: Request): SessionPayload | null {
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME && rest.length) {
      return deserialize(rest.join("="));
    }
  }
  return null;
}

export interface SessionUser {
  id: string;
  email: string;
  role: string;
  // Carried from the profile lookup that resolves the session, so callers like
  // /api/auth/me don't repeat the same query (measured 300ms) on every page.
  full_name?: string | null;
  program_id?: string | null;
  current_year?: number | null;
}

// ---------------------------------------------------------------------------
// Per-instance resolved-user cache.
//
// Resolving a session to a user costs a Supabase round trip, measured at
// 300-1000ms from the deployed function. Every authenticated API call pays it,
// and so does /api/auth/me on every page. A short in-process cache removes that
// wait from repeat calls on the same instance. Revocation stays immediate:
// both revoke paths evict the entry below, and the 60s TTL bounds any other
// staleness.
// ---------------------------------------------------------------------------
interface CachedUser {
  userId: string;
  user: SessionUser;
  at: number;
}

const USER_CACHE_TTL_MS = 60_000;
const userCache = new Map<string, CachedUser>();

function cacheGet(sid: string): SessionUser | null {
  const hit = userCache.get(sid);
  if (!hit) return null;
  if (Date.now() - hit.at > USER_CACHE_TTL_MS) {
    userCache.delete(sid);
    return null;
  }
  return hit.user;
}

function cacheSet(sid: string, user: SessionUser) {
  if (userCache.size > 500) userCache.clear();
  userCache.set(sid, { userId: user.id, user, at: Date.now() });
}

/** Drop cached users for a session id (logout) or for a whole user. */
export function invalidateSessionUserCache(sid?: string, userId?: string) {
  if (sid) userCache.delete(sid);
  if (!userId) return;
  for (const [key, value] of userCache) {
    if (value.userId === userId) userCache.delete(key);
  }
}

/**
 * Resolve a session payload to a real user. File-mode users come from the
 * users file (deleted users lose access immediately). Supabase-mode users
 * (IDs not in the file) are validated against the `profiles` table.
 */
async function resolveSessionUser(
  payload: SessionPayload
): Promise<SessionUser | null> {
  // On a serverless host the users file is re-seeded per instance, so ids like
  // "admin-001" / "demo-001" are stubs that match no database row. Every
  // uuid-keyed query (notifications, attempts, quizzes) then silently matched
  // nothing — support tickets reached the admin's row but the bell read the
  // empty file store. Resolve such sessions to their profile by email first.
  const UUID_RE_SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE_SESSION.test(payload.userId) && payload.email) {
    const { isEphemeralHost } = await import("./server-host");
    if (isEphemeralHost()) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/server");
        const admin = await createAdminClient();
        if (admin) {
          const { data } = await admin
            .from("profiles")
            .select("id, email, role, full_name, program_id, current_year")
            .ilike("email", payload.email)
            .maybeSingle();
          if (data?.id) {
            return {
              id: data.id,
              email: data.email,
              role: data.role || payload.role || "student",
              full_name: data.full_name ?? null,
              program_id: data.program_id ?? null,
              current_year: data.current_year ?? null,
            };
          }
        }
      } catch { /* fall back to the file id below */ }
    }
  }

  const users = readLocalUsers();
  const user = users.find((u) => u.id === payload.userId);
  if (user) {
    return { id: user.id, email: user.email, role: user.role || "student" };
  }

  // Built-in admin: resolve deterministically even on an ephemeral or
  // read-only filesystem (Vercel) where the users file can't persist.
  if (payload.userId === "admin-001") {
    return { id: "admin-001", email: ADMIN_EMAIL, role: "admin" };
  }

  // Not in the file store — try profiles by id.
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  if (!supabase) return null; // deleted — session revoked

  const resolveByProfile = async (): Promise<{ id: string; email: string; role: string } | null> => {
    let byId: { data: { id: string; email: string; role: string } | null; error?: unknown } | undefined;
    try {
              byId = await supabase
        .from("profiles")
        .select("id, email, role, full_name, program_id, current_year")
        .eq("id", payload.userId)
        .maybeSingle() as unknown as { data: { id: string; email: string; role: string } | null; error?: unknown };
    } catch {
      /* infra hiccup */
    }

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (byId?.data && UUID_RE.test(byId.data.id)) {
      return byId.data as { id: string; email: string; role: string };
    }

    // Built-in / file-mode ids (e.g. "admin-001") have no matching profile
    // row, and a server-side auth lookup can also fail on ephemeral hosts. Map
    // non-uuid ids to the profile that owns the same email instead, so a
    // session staying valid on Vercel still resolves to a real user.
    if (payload.email) {
      try {
        const byEmail = await supabase
          .from("profiles")
          .select("id, email, role")
          .ilike("email", payload.email)
          .maybeSingle() as unknown as
          | { data: { id: string; email: string; role: string } | null }
          | undefined;
        if (byEmail?.data) return byEmail.data as { id: string; email: string; role: string };
      } catch { /* infra hiccup */ }
      // No profile row for this email. This used to fall back to "the first
      // admin" so a session stayed usable — which handed admin rights to any
      // account whose profile had been deleted while its cookie was still
      // valid. The cookie's signature proves who signed in, not what they may
      // do now, so keep the least privilege the payload claims and let the
      // admin gates re-check against real data.
      return { id: payload.userId, email: payload.email, role: "student" };
    }

    return null;
  };

  const data = await resolveByProfile();
  if (!data) return null;
  return data;
}

/**
 * Returns the authenticated user for this request, or null.
 */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const payload = getSessionFromRequest(request);
  if (!payload) return null;
  try {
    const cached = cacheGet(payload.sid);
    if (cached) return cached;
    // Revocation check — a session id removed from the store is dead.
    const { isSessionValid } = await import("./session-store");
    if (!(await isSessionValid(payload.userId, payload.sid))) return null;
    const user = await resolveSessionUser(payload);
    if (user) cacheSet(payload.sid, user);
    return user;
  } catch {
    return null;
  }
}

/** Returns the authenticated admin for this request, or null. */
export async function getSessionAdmin(request: Request): Promise<SessionUser | null> {
  const user = await getSessionUser(request);
  if (!user) return null;
  return user.role === "admin" ? user : null;
}

/** Revoke the session presented on this request (used by logout). */
export async function revokeCurrentSession(request: Request): Promise<void> {
  const payload = getSessionFromRequest(request);
  if (!payload) return;
  invalidateSessionUserCache(payload.sid, payload.userId);
  try {
    const { revokeSession } = await import("./session-store");
    await revokeSession(payload.userId, payload.sid);
  } catch { /* best-effort */ }
}

/** Revoke every session issued to a user ("log out everywhere"). */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  invalidateSessionUserCache(undefined, userId);
  try {
    const { revokeAllSessions } = await import("./session-store");
    return await revokeAllSessions(userId);
  } catch {
    return 0;
  }
}

/**
 * Session user from Next.js `cookies()` — for route handlers / server
 * components that don't receive the raw Request object.
 */
export async function getSessionUserFromCookieStore(): Promise<SessionUser | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = deserialize(token);
  if (!payload) return null;
  try {
    const cached = cacheGet(payload.sid);
    if (cached) return cached;
    // Same revocation check as the request-based path.
    const { isSessionValid } = await import("./session-store");
    if (!(await isSessionValid(payload.userId, payload.sid))) return null;
    const user = await resolveSessionUser(payload);
    if (user) cacheSet(payload.sid, user);
    return user;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
