import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const USERS_KEY = "ollin_demo_users";
const DEFAULT_USERS = [
  { id: "admin-001", email: "jkaidoo1@mail.com", full_name: "Admin User", role: "admin", created_at: new Date(Date.now() - 86400000 * 60).toISOString() },
  { id: "demo-user-001", email: "demo@ollin.app", full_name: "Alex Student", role: "student", created_at: new Date(Date.now() - 86400000 * 30).toISOString() },
];

function getUsersPath() {
  return join(process.cwd(), ".ollin-users.json");
}

function readDemoUsers() {
  const path = getUsersPath();
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, "utf-8"));
    } catch { /* ignore */ }
  }
  // Initialize with defaults
  writeFileSync(path, JSON.stringify(DEFAULT_USERS, null, 2));
  return DEFAULT_USERS;
}

function writeDemoUsers(users: unknown[]) {
  writeFileSync(getUsersPath(), JSON.stringify(users, null, 2));
}

// GET — list all users (admin only)
export async function GET(request: NextRequest) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";

    if (demo) {
      const users = readDemoUsers();
      return NextResponse.json({ users });
    }

    // Real Supabase — use service role to list all users
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    // Check current user is admin
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { data: users, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ users: users || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch users" },
      { status: 500 }
    );
  }
}

// POST — create a new user account (admin only)
export async function POST(request: NextRequest) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    const body = await request.json();
    const { email, password, full_name, role, program_id } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (demo) {
      const users = readDemoUsers();
      const newUser = {
        id: `user-${Date.now()}`,
        email,
        full_name: full_name || email.split("@")[0],
        role: role || "student",
        program_id: program_id || null,
        created_at: new Date().toISOString(),
      };
      users.push(newUser);
      writeDemoUsers(users);
      return NextResponse.json({ user: newUser, message: "Account created (demo mode)" });
    }

    // Real Supabase — use admin API to create user
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    // Verify requester is admin
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Create user with service role client
    const { createAdminClient } = await import("@/lib/supabase/server");
    const adminSupabase = await createAdminClient();

    const { data: newUser, error: createError } =
      await adminSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name || email.split("@")[0],
        },
      });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    // Update role and program if not defaults
    const updates: Record<string, unknown> = {};
    if (role && role !== "student") updates.role = role;
    if (program_id) updates.program_id = program_id;
    if (Object.keys(updates).length > 0 && newUser.user) {
      await adminSupabase
        .from("profiles")
        .update(updates)
        .eq("id", newUser.user.id);
    }

    return NextResponse.json({
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
        full_name: full_name || email.split("@")[0],
        role: role || "student",
      },
      message: "Account created successfully",
      temp_password: password,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create user" },
      { status: 500 }
    );
  }
}

// DELETE — remove a user (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("id");

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    if (demo) {
      const users = readDemoUsers();
      const filtered = users.filter((u: any) => u.id !== userId);
      writeDemoUsers(filtered);
      return NextResponse.json({ success: true, message: "User deleted (demo)" });
    }

    const { createAdminClient } = await import("@/lib/supabase/server");
    const adminSupabase = await createAdminClient();

    const { error } = await adminSupabase.auth.admin.deleteUser(userId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete user" },
      { status: 500 }
    );
  }
}
