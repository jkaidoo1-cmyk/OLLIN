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
import { DEFAULT_DEMO_USERS, ADMIN_PASSWORD } from "./demo-constants";

export interface StoredDemoUser {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "student";
  password?: string;
  program_id?: string | null;
  current_year?: number;
  created_at: string;
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
    password: u.password,
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
      // Migrate: ensure built-in accounts exist with the current password
      let changed = false;
      for (const def of DEFAULT_DEMO_USERS) {
        const existing = users.find((u) => u.id === def.id);
        if (!existing) {
          users.push({
            id: def.id,
            email: def.email,
            full_name: def.full_name,
            role: def.role,
            password: def.password,
            program_id: null,
            current_year: def.current_year,
            created_at: new Date().toISOString(),
          });
          changed = true;
        } else if (existing.password !== def.password) {
          existing.password = def.password;
          existing.role = def.role;
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
