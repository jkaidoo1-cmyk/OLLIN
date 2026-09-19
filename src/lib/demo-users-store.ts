/**
 * Server-side demo user store (single source of truth for accounts).
 *
 * Demo accounts live in `.ollin-users.json` on the server so that:
 *  - users created by an admin can log in from any browser,
 *  - deletions persist across page loads / different browsers,
 *  - admin overview counts reflect the same file the auth route checks.
 *
 * Only this module (and the auth route) reads passwords.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { DEFAULT_DEMO_USERS, ADMIN_PASSWORD } from "./demo-constants";

export interface StoredDemoUser {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "student";
  /** Plaintext only appears transiently before migration; stored form is a hash. */
  password?: string;
  password_hash?: string;
  program_id?: string | null;
  current_year?: number;
  created_at: string;
}

// ─── Password hashing (scrypt) ──────────────────────────
// Format: scrypt:<saltHex>:<hashHex>. Migration is lazy: any user still
// carrying a plaintext `password` is re-hashed the next time users are saved.

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(plain: string, user: StoredDemoUser): boolean {
  const stored = user.password_hash || user.password;
  if (!stored) return false;
  if (stored.startsWith("scrypt:")) {
    const [, saltHex, hashHex] = stored.split(":");
    try {
      const expected = Buffer.from(hashHex, "hex");
      const actual = scryptSync(plain, Buffer.from(saltHex, "hex"), expected.length);
      return timingSafeEqual(expected, actual);
    } catch {
      return false;
    }
  }
  // Legacy plaintext — direct compare, then upgrade.
  if (stored === plain) {
    user.password_hash = hashPassword(plain);
    delete user.password;
    return true;
  }
  return false;
}

function getUsersPath() {
  return join(process.cwd(), ".ollin-users.json");
}

function seedDefaults(): StoredDemoUser[] {
  return DEFAULT_DEMO_USERS.map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    role: u.role,
    password_hash: hashPassword(u.password),
    program_id: null,
    current_year: u.current_year,
    created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
  }));
}

export function readDemoUsers(): StoredDemoUser[] {
  const path = getUsersPath();
  if (existsSync(path)) {
    try {
      const users: StoredDemoUser[] = JSON.parse(readFileSync(path, "utf-8"));
      // Migrate: ensure built-in accounts exist. Their password is managed
      // via ADMIN_PASSWORD comparisons in the auth route (hash upgrade is
      // lazy through verifyPassword), so seeding only fixes identity/role.
      let changed = false;
      for (const def of DEFAULT_DEMO_USERS) {
        const existing = users.find((u) => u.id === def.id);
        if (!existing) {
          users.push({
            id: def.id,
            email: def.email,
            full_name: def.full_name,
            role: def.role,
            password_hash: hashPassword(def.password),
            program_id: null,
            current_year: def.current_year,
            created_at: new Date().toISOString(),
          });
          changed = true;
        } else if (existing.role !== def.role) {
          existing.role = def.role;
          changed = true;
        }
      }
      // Opportunistic hash migration: hash any remaining plaintext passwords.
      for (const u of users) {
        if (u.password && !u.password_hash) {
          u.password_hash = hashPassword(u.password);
          delete u.password;
          changed = true;
        }
      }
      if (changed) writeDemoUsers(users);
      return users;
    } catch {
      /* fall through to reseed */
    }
  }
  const seeded = seedDefaults();
  writeDemoUsers(seeded);
  return seeded;
}

export function writeDemoUsers(users: StoredDemoUser[]) {
  // Serverless hosts (Vercel) have a read-only filesystem. Writes are
  // best-effort there: the seeded users still work for this warm instance,
  // and persistent storage comes from Supabase when configured.
  try {
    writeFileSync(getUsersPath(), JSON.stringify(users, null, 2));
  } catch {
    /* read-only fs — keep going */
  }
}

/** Strip passwords before sending user records to the browser. */
export function publicUser(u: StoredDemoUser) {
  return {
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    role: u.role,
    program_id: u.program_id ?? null,
    current_year: u.current_year,
    created_at: u.created_at,
  };
}

/** Demo credentials used by the built-in admin (kept in sync with demo-constants). */
export const DEMO_ADMIN_PASSWORD = ADMIN_PASSWORD;
