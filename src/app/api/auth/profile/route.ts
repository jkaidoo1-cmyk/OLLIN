import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { readLocalUsers, writeLocalUsers } from "@/lib/local-users-store";
import { serverError } from "@/lib/api-errors";

/**
 * PATCH /api/auth/profile — a logged-in user updates their own profile.
 * Only safe self-service fields are accepted: current_year, program_id and
 * password. Full name, role and email stay admin-controlled — a full_name
 * value in the body is silently ignored. The programme is self-service
 * because students create their own accounts: an admin assignment they never
 * asked for is not a substitute for choosing their course.
 *
 * Works in both backends:
 *   - Supabase configured → updates profiles via the service-role client
 *   - File mode           → updates the server-side users file (session-authed)
 */
export async function PATCH(request: NextRequest) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    current_year?: number;
    program_id?: string | null;
    full_name?: string;
    current_password?: string;
    new_password?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // ── Password change (self-service) ─────────────────────
  // Requires the current password; revokes nothing else — same-device session
  // stays valid, other devices keep working until their cookie expires.
  if (body.new_password !== undefined) {
    const newPassword = String(body.new_password);
    // A change screen with no rules would let anyone step around signup's.
    const { passwordProblem } = await import("@/lib/password-policy");
    const weakPassword = passwordProblem(newPassword, session.email);
    if (weakPassword) {
      return NextResponse.json({ error: weakPassword }, { status: 400 });
    }

    // Try Supabase first (user may be a Supabase-created account)
    let supabaseOk = false;
    try {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const admin = await createAdminClient();
      if (admin) {
        // Verify current password against Supabase auth
        const { data: signInData, error: signInError } = await admin.auth.signInWithPassword({
          email: session.email,
          password: String(body.current_password),
        });
        if (signInError) {
          // Supabase signIn error — fall through to local file check
        } else {
          // Current password verified — update to new password
          const { error: updateError } = await admin.auth.admin.updateUserById(session.id, {
            password: newPassword,
          });
          if (!updateError) {
            supabaseOk = true;
            return NextResponse.json({ message: "Password updated" });
          }
        }
      }
    } catch { /* fall through to local file */ }

    // Fall back to local file store
    const { verifyPassword, hashPassword } = await import("@/lib/local-users-store");
    const users = readLocalUsers();
    const me = users.find((u) => u.id === session.id);
    if (!me) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!body.current_password || !verifyPassword(String(body.current_password), me)) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }
    me.password_hash = hashPassword(newPassword);
    delete me.password;
    writeLocalUsers(users);
    return NextResponse.json({ message: "Password updated" });
  }

  const updates: { current_year?: number; program_id?: string | null } = {};
  if (body.current_year !== undefined) {
    const y = Number(body.current_year);
    if (!Number.isInteger(y) || y < 1 || y > 8) {
      return NextResponse.json({ error: "Year must be between 1 and 8" }, { status: 400 });
    }
    updates.current_year = y;
  }
  if (body.program_id !== undefined) {
    // Empty string clears the choice; anything else is the programme picked
    // from the list the signup/profile screen fetched.
    const p = body.program_id === null ? "" : String(body.program_id).trim();
    updates.program_id = p || null;
  }
  // full_name deliberately not accepted — names are managed by the admin.
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Local-file user ids (e.g. "demo-001") are not UUIDs — passing them to
  // the profiles table throws a Postgres type error, so only hit Supabase
  // when the session id actually looks like a UUID.
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.id);

  try {
    if (looksLikeUuid) {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const admin = await createAdminClient();
      if (admin) {
        // profiles.program_id is a uuid column: a file-backed programme id
        // would fail the cast, so refuse it with a message instead of a 500.
        if (
          updates.program_id &&
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updates.program_id)
        ) {
          return NextResponse.json(
            { error: "That programme isn't available on this account. Pick one from the list." },
            { status: 400 }
          );
        }
        const { error } = await admin.from("profiles").update(updates).eq("id", session.id);
        if (error) {
          return serverError("profile.update", error, {
            message: "Your profile change wasn't saved. Please try again.",
          });
        }
        return NextResponse.json({ message: "Profile updated" });
      }
    }

    // File mode — the session cookie is the authority here.
    const users = readLocalUsers();
    const user = users.find((u) => u.id === session.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (updates.current_year !== undefined) user.current_year = updates.current_year;
    if (updates.program_id !== undefined) user.program_id = updates.program_id;
    writeLocalUsers(users);
    return NextResponse.json({ message: "Profile updated" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update profile" },
      { status: 500 }
    );
  }
}
