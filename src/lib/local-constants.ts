/**
 * Shared local accounts + admin identity.
 * Client-safe (no fs/localStorage) so both the browser (local.ts / admin.ts)
 * and server API routes (auth, admin users) read from the same source.
 *
 * Values are env-overridable so production (Vercel) can keep its real
 * credentials in environment variables. `process.env.*` is inlined at build
 * time on the server; in the browser bundle it is undefined and the fallback
 * keeps the existing client-side behavior unchanged.
 */

export interface LocalAccountSeed {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "student";
  password: string;
  current_year?: number;
}

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "jkaidoo1@mail.com";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "OllinAdmin1598";

/** Demo student account — seeded server-side so it can log in from any device. */
export const DEMO_EMAIL = process.env.DEMO_STUDENT_EMAIL || "demo@student.com";
export const DEMO_PASSWORD = process.env.DEMO_STUDENT_PASSWORD || "password";

export const DEFAULT_LOCAL_USERS: LocalAccountSeed[] = [
  {
    id: "admin-001",
    email: ADMIN_EMAIL,
    full_name: "Admin User",
    role: "admin",
    password: ADMIN_PASSWORD,
  },
  {
    id: "demo-001",
    email: DEMO_EMAIL,
    full_name: "Demo Student",
    role: "student",
    password: DEMO_PASSWORD,
    current_year: 1,
  },
];
