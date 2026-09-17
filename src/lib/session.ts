/**
 * Server-side session authentication.
 *
 * Login issues an httpOnly, signed cookie. All admin/config API routes verify
 * this cookie server-side — localStorage alone is never trusted for writes.
 */
import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { readDemoUsers } from "./demo-users-store";

const COOKIE_NAME = "ollin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface SessionPayload {
  userId: string;
  email: string;
  role: string;
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
  } catch { /* read-only fs (Vercel) — secret lives for this instance only */ }
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
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    role: user.role || "student",
    exp: Date.now() + SESSION_TTL_MS,
  };
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
 * Returns the authenticated user for this request, or null.
 * The user record is re-read from the users file so deleted users
 * lose access immediately even with a still-valid cookie.
 */
export function getSessionUser(request: Request): SessionUser | null {
  const payload = getSessionFromRequest(request);
  if (!payload) return null;
  const users = readDemoUsers();
  const user = users.find((u) => u.id === payload.userId);
  if (!user) return null; // deleted — session revoked
  return { id: user.id, email: user.email, role: user.role || "student" };
}

/** Returns the authenticated admin for this request, or null. */
export function getSessionAdmin(request: Request): SessionUser | null {
  const user = getSessionUser(request);
  if (!user) return null;
  return user.role === "admin" ? user : null;
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
  const users = readDemoUsers();
  const user = users.find((u) => u.id === payload.userId);
  if (!user) return null;
  return { id: user.id, email: user.email, role: user.role || "student" };
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
