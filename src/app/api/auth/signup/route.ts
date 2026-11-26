import { NextRequest, NextResponse } from "next/server";
import {
  readLocalUsers,
  writeLocalUsers,
  publicUser,
  hashPassword,
} from "@/lib/local-users-store";
import { issueSessionCookie } from "@/lib/session";
import { checkThrottle } from "@/lib/rate-limit";
import { serverError } from "@/lib/api-errors";
import { isEphemeralHost, isLocalRequest } from "@/lib/server-host";
import { passwordProblem } from "@/lib/password-policy";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmailTaken(users: { email?: string }[], email: string) {
  const normalized = email.toLowerCase().trim();
  return users.some((u) => u.email?.toLowerCase().trim() === normalized);
}

// POST — self-service sign up (creates a student account, then signs them in)
export async function POST(request: NextRequest) {
  try {
    const limit = checkThrottle(request, "signup", 5, 60_000);
    if (limit.blocked) {
      return NextResponse.json(
        { error: limit.message },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.full_name || "").trim();
    // A student picks their programme and class year while signing up, so the
    // dashboard shows their courses straight away instead of waiting for an
    // admin to assign them.
    const programId = body.program_id ? String(body.program_id).trim() : null;
    const year = Number(body.current_year ?? 1);
    const currentYear = Number.isInteger(year) && year >= 1 && year <= 8 ? year : 1;
    const local = isLocalRequest(request);

    const looksLikeUuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }
    // Same policy the form runs, re-checked here because the endpoint is public.
    const weakPassword = passwordProblem(password, email);
    if (weakPassword) {
      return NextResponse.json({ error: weakPassword }, { status: 400 });
    }

    const displayName = fullName || email.split("@")[0];

    // Try the database first on hosted deployments, the same way admin-created
    // accounts do. Roles are always forced to "student" here — signup must
    // never be able to grant admin rights.
    if (!local) {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const adminSupabase = await createAdminClient();

      if (adminSupabase) {
        const { data: sbUser, error: createError } =
          await adminSupabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              full_name: displayName,
              role: "student",
              program_id: programId && looksLikeUuid(programId) ? programId : null,
              current_year: currentYear,
            },
          });

        if (!createError && sbUser?.user) {
          // A local-file programme id is not a uuid and cannot go in the
          // profiles column; on a database deployment the ids always are.
          const storedProgramId =
            programId && looksLikeUuid(programId) ? programId : null;
          // Best effort: the profile row is usually created by a trigger from
          // the metadata above. If it is already there, make sure the chosen
          // programme and year landed on it.
          try {
            await adminSupabase
              .from("profiles")
              .update({ program_id: storedProgramId, current_year: currentYear })
              .eq("id", sbUser.user.id);
          } catch { /* trigger may not have created the row yet */ }

          const user = {
            id: sbUser.user.id,
            email: sbUser.user.email || email,
            full_name: displayName,
            role: "student" as const,
            program_id: storedProgramId,
            current_year: currentYear,
            created_at: new Date().toISOString(),
          };
          // No local flag: this is a database account, like a Supabase login.
          const res = NextResponse.json({
            user,
            message: "Account created",
          });
          res.headers.append(
            "Set-Cookie",
            await issueSessionCookie({
              id: user.id,
              email: user.email,
              role: user.role,
            })
          );
          return res;
        }

        if (createError && /already|exist|duplicate/i.test(createError.message || "")) {
          return NextResponse.json(
            { error: "An account with this email already exists." },
            { status: 409 }
          );
        }

        if (isEphemeralHost()) {
          console.error("[auth.signup] database signup failed", createError?.message);
          return NextResponse.json(
            {
              error: "We couldn't create your account right now. Please try again shortly.",
              code: "service_unavailable",
            },
            { status: 503 }
          );
        }
      } else if (isEphemeralHost()) {
        console.error("[auth.signup] no account store configured on this host");
        return NextResponse.json(
          {
            error: "We couldn't create your account right now. Please try again shortly.",
            code: "service_unavailable",
          },
          { status: 503 }
        );
      }
    }

    // File-backed store: the same one admin-created accounts use, so signups
    // work on the local machine (and any deliberately file-backed host).
    const users = readLocalUsers();
    if (isEmailTaken(users, email)) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const newUser = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      email,
      full_name: displayName,
      role: "student" as const,
      password_hash: hashPassword(password),
      program_id: programId,
      current_year: currentYear,
      created_at: new Date().toISOString(),
    };
    users.push(newUser);

    if (!writeLocalUsers(users)) {
      return NextResponse.json(
        {
          error:
            "Could not save your account — the server could not write to its user store, so nothing was created. Please try again later.",
          not_persisted: true,
        },
        { status: 507 }
      );
    }

    const res = NextResponse.json({
      user: publicUser(newUser),
      local: true,
      message: "Account created",
    });
    res.headers.append(
      "Set-Cookie",
      await issueSessionCookie({
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
      })
    );
    return res;
  } catch (error) {
    return serverError("auth.signup", error, {
      message: "We couldn't create your account. Please try again in a moment.",
    });
  }
}
