import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { readLocalUsers, writeLocalUsers } from "@/lib/local-users-store";

/**
 * PATCH /api/auth/profile — a logged-in user updates their own profile.
 * Only safe self-service fields are accepted: current_year and password.
 * Full name, role, program assignment, and email stay admin-controlled —
 * a full_name value in the body is silently ignored.
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

  let body: { current_year?: number; full_name?: string; current_password?: string; new_password?: string };
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
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
    }
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

  const updates: { current_year?: number } = {};
  if (body.current_year !== undefined) {
    const y = Number(body.current_year);
    if (!Number.isInteger(y) || y < 1 || y > 8) {
      return NextResponse.json({ error: "Year must be between 1 and 8" }, { status: 400 });
    }
    updates.current_year = y;
  }
  // full_name deliberately not accepted — names are managed by the admin.
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const admin = await createAdminClient();
    if (admin) {
      const { error } = await admin.from("profiles").update(updates).eq("id", session.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ message: "Profile updated" });
    }

    // File mode — the session cookie is the authority here.
    const users = readLocalUsers();
    const user = users.find((u) => u.id === session.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (updates.current_year !== undefined) user.current_year = updates.current_year;
    writeLocalUsers(users);
    return NextResponse.json({ message: "Profile updated" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update profile" },
      { status: 500 }
    );
  }
}
