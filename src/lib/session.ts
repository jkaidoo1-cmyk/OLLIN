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
  return `${COOKIE_NAME}=${serialize(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
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
}

/**
 * Resolve a session payload to a real user. File-mode users come from the
 * users file (deleted users lose access immediately). Supabase-mode users
 * (IDs not in the file) are validated against the `profiles` table.
 */
async function resolveSessionUser(
  payload: SessionPayload
): Promise<SessionUser | null> {
  const users = readLocalUsers();
  const user = users.find((u) => u.id === payload.userId);
  if (user) {
    return { id: user.id, email: user.email, role: user.role || "student" };
  }

  // Not in the file store — if Supabase is configured, check profiles.
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  if (!supabase) return null; // deleted — session revoked
  const { data } = await supabase
    .from("profiles")
    .select("id, email, role")
    .eq("id", payload.userId)
    .single();
  if (!data) return null;
  return { id: data.id, email: data.email, role: data.role || "student" };
}

/**
 * Returns the authenticated user for this request, or null.
 */
export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const payload = getSessionFromRequest(request);
  if (!payload) return null;
  try {
    // Revocation check — a session id removed from the store is dead.
    const { isSessionValid } = await import("./session-store");
    if (!(await isSessionValid(payload.userId, payload.sid))) return null;
    return await resolveSessionUser(payload);
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
  try {
    const { revokeSession } = await import("./session-store");
    await revokeSession(payload.userId, payload.sid);
  } catch { /* best-effort */ }
}

/** Revoke every session issued to a user ("log out everywhere"). */
export async function revokeAllUserSessions(userId: string): Promise<number> {
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
    // Same revocation check as the request-based path.
    const { isSessionValid } = await import("./session-store");
    if (!(await isSessionValid(payload.userId, payload.sid))) return null;
    return await resolveSessionUser(payload);
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
