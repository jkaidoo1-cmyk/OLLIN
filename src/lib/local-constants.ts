/**
 * Shared local accounts + admin identity.
 * Client-safe (no fs/localStorage) so both the browser (local.ts / admin.ts)
 * and server API routes (auth, admin users) read from the same source.
 */

export interface LocalAccountSeed {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "student";
  password: string;
  current_year?: number;
}

export const ADMIN_EMAIL = "jkaidoo1@mail.com";
export const ADMIN_PASSWORD = "OllinAdmin1598";

export const DEFAULT_LOCAL_USERS: LocalAccountSeed[] = [
  {
    id: "admin-001",
    email: ADMIN_EMAIL,
    full_name: "Admin User",
    role: "admin",
    password: ADMIN_PASSWORD,
  },
];
