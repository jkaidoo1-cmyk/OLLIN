import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { readDemoUsers, writeDemoUsers } from "@/lib/demo-users-store";

/**
 * PATCH /api/auth/profile — a logged-in user updates their own profile.
 * Only safe self-service fields are accepted: current_year and full_name.
 * Role, program assignment, and email stay admin-controlled.
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

  let body: { current_year?: number; full_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates: { current_year?: number; full_name?: string } = {};
  if (body.current_year !== undefined) {
    const y = Number(body.current_year);
    if (!Number.isInteger(y) || y < 1 || y > 8) {
      return NextResponse.json({ error: "Year must be between 1 and 8" }, { status: 400 });
    }
    updates.current_year = y;
  }
  if (body.full_name !== undefined) {
    const name = String(body.full_name).trim();
    if (name.length < 1 || name.length > 120) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    updates.full_name = name;
  }
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
    const users = readDemoUsers();
    const user = users.find((u) => u.id === session.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (updates.current_year !== undefined) user.current_year = updates.current_year;
    if (updates.full_name !== undefined) user.full_name = updates.full_name;
    writeDemoUsers(users);
    return NextResponse.json({ message: "Profile updated" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update profile" },
      { status: 500 }
    );
  }
}
