/**
 * Shared demo accounts + admin identity.
 * Client-safe (no fs/localStorage) so both the browser (demo.ts / admin.ts)
 * and server API routes (auth, admin users) read from the same source.
 */

export interface DemoAccountSeed {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "student";
  password: string;
  current_year?: number;
}

export const ADMIN_EMAIL = "jkaidoo1@mail.com";
export const ADMIN_PASSWORD = "OllinAdmin1598";

export const DEFAULT_DEMO_USERS: DemoAccountSeed[] = [
  {
    id: "admin-001",
    email: ADMIN_EMAIL,
    full_name: "Admin User",
    role: "admin",
    password: ADMIN_PASSWORD,
  },
  {
    id: "demo-user-001",
    email: "demo@ollin.app",
    full_name: "Alex Student",
    role: "student",
    password: "password",
    current_year: 1,
  },
];
