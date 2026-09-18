import { NextRequest, NextResponse } from "next/server";
import {
  readDemoUsers,
  writeDemoUsers,
  publicUser,
} from "@/lib/demo-users-store";
import { getSessionAdmin } from "@/lib/session";

function isEmailTaken(users: any[], email: string, excludeId?: string) {
  const normalized = String(email).toLowerCase().trim();
  return users.some(
    (u) =>
      u.email?.toLowerCase().trim() === normalized && u.id !== excludeId
  );
}

// GET — list all users (admin only)
export async function GET(request: NextRequest) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";

    // File mode when the header is set OR Supabase is not configured —
    // so a valid admin session cookie works even in a fresh browser.
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    if (demo || !supabase) {
      // Server-side auth: the request must carry a valid admin session cookie.
      if (!(await getSessionAdmin(request))) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
      const users = readDemoUsers().map(publicUser);
      return NextResponse.json({ users });
    }

    // Real Supabase — use service role to list all users

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

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    if (demo || !supabase) {
      // File mode: only a valid admin session may create accounts.
      if (!(await getSessionAdmin(request))) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
      const users = readDemoUsers();
      if (isEmailTaken(users, email)) {
        return NextResponse.json(
          { error: "An account with this email already exists" },
          { status: 409 }
        );
      }
      const newUser = {
        id: `user-${Date.now()}`,
        email: String(email).toLowerCase().trim(),
        full_name: full_name || String(email).split("@")[0],
        role: role || "student",
        password: String(password),
        program_id: program_id || null,
        current_year: role === "admin" ? undefined : 1,
        created_at: new Date().toISOString(),
      };
      users.push(newUser);
      writeDemoUsers(users);
      return NextResponse.json({ user: publicUser(newUser), message: "Account created" });
    }

    // Real Supabase — use admin API to create user
    if (!supabase) {
      // Unreachable in practice (file mode handled above), kept as a guard.
      return NextResponse.json(
        { error: "No account backend configured. Use demo mode." },
        { status: 503 }
      );
    }

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
          role: role || "student",
          current_year: role === "admin" ? null : 1,
        },
      });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    // Update role, program, and year if not defaults
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
        program_id: program_id || null,
        current_year: role === "admin" ? null : 1,
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

// PATCH — update a user (name, role, program, or password reset) — admin only
export async function PATCH(request: NextRequest) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    const body = await request.json();
    const userId = body.id;

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const { createClient, createAdminClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    if (demo || !supabase) {
      // File mode: only a valid admin session may edit users.
      if (!(await getSessionAdmin(request))) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
      const users = readDemoUsers();
      const user = users.find((u: any) => u.id === userId);
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      if (body.email && isEmailTaken(users, body.email, userId)) {
        return NextResponse.json(
          { error: "An account with this email already exists" },
          { status: 409 }
        );
      }

      // Never allow an admin to demote/delete the final built-in admin via PATCH role
      if (user.id === "admin-001" && body.role && body.role !== "admin") {
        return NextResponse.json(
          { error: "The built-in admin account cannot change role" },
          { status: 400 }
        );
      }

      if (body.email) user.email = String(body.email).toLowerCase().trim();
      if (body.full_name !== undefined) user.full_name = body.full_name;
      if (body.role) user.role = body.role;
      if (body.program_id !== undefined) user.program_id = body.program_id || null;
      if (body.current_year !== undefined) user.current_year = body.current_year;
      if (body.password) user.password = String(body.password);

      writeDemoUsers(users);
      return NextResponse.json({ user: publicUser(user), message: "Account updated" });
    }

    // Real Supabase
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

    const adminSupabase = await createAdminClient();
    const updates: Record<string, unknown> = {};
    if (body.full_name !== undefined) updates.full_name = body.full_name;
    if (body.role) updates.role = body.role;
    if (body.program_id !== undefined) updates.program_id = body.program_id || null;
    if (body.current_year !== undefined) updates.current_year = body.current_year;
    if (Object.keys(updates).length > 0) {
      await adminSupabase.from("profiles").update(updates).eq("id", userId);
    }
    if (body.email) {
      const { error: emailError } = await adminSupabase.auth.admin.updateUserById(userId, {
        email: String(body.email).toLowerCase().trim(),
      });
      if (emailError) {
        return NextResponse.json({ error: emailError.message }, { status: 400 });
      }
    }
    if (body.password) {
      const { error: pwError } = await adminSupabase.auth.admin.updateUserById(userId, {
        password: String(body.password),
      });
      if (pwError) {
        return NextResponse.json({ error: pwError.message }, { status: 400 });
      }
    }

    return NextResponse.json({ message: "Account updated" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update user" },
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

    const { createAdminClient } = await import("@/lib/supabase/server");
    const adminSupabase = await createAdminClient();

    if (demo || !adminSupabase) {
      // File mode: only a valid admin session may delete users.
      if (!(await getSessionAdmin(request))) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
      const users = readDemoUsers();
      const target = users.find((u: any) => u.id === userId);
      if (!target) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      // Never allow deleting admin accounts from the demo file.
      if (target.role === "admin") {
        return NextResponse.json(
          { error: "Admin accounts cannot be deleted" },
          { status: 400 }
        );
      }
      const filtered = users.filter((u: any) => u.id !== userId);
      writeDemoUsers(filtered);
      return NextResponse.json({ success: true, message: "User deleted" });
    }

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
