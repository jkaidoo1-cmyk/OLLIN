import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  readLocalUsers,
  writeLocalUsers,
  publicUser,
} from "@/lib/local-users-store";
import { getSessionAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/local-users-store";
import { recordAdminAction } from "@/lib/audit";
import { revokeAllForEmail } from "@/lib/session-store";

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
    const local = request.headers.get("x-local-mode") === "true";

    // File mode when the header is set OR Supabase is not configured —
    // so a valid admin session cookie works even in a fresh browser.
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    if (local || !supabase) {
      // Server-side auth: the request must carry a valid admin session cookie.
      if (!(await getSessionAdmin(request))) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
      const users = readLocalUsers().map(publicUser);
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
    const local = request.headers.get("x-local-mode") === "true";
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

    if (local || !supabase) {
      // File mode: only a valid admin session may create accounts.
      if (!(await getSessionAdmin(request))) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
      const users = readLocalUsers();
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
        password_hash: hashPassword(String(password)),
        program_id: program_id || null,
        current_year: role === "admin" ? undefined : 1,
        created_at: new Date().toISOString(),
      };
      users.push(newUser);
      const saved = writeLocalUsers(users);
      if (!saved) {
        return NextResponse.json(
          {
            error:
              "Could not save the account — this deployment has no writable storage (and Supabase is not connected). Connect Supabase to enable persistent user management.",
            not_persisted: true,
          },
          { status: 507 }
        );
      }
      const admin = await getSessionAdmin(request);
      await recordAdminAction(request, admin, "user.create", "user", newUser.id, `Created ${newUser.role} account ${newUser.email}`);
      return NextResponse.json({ user: publicUser(newUser), message: "Account created" });
    }

    // Real Supabase — use admin API to create user
    if (!supabase) {
      // Unreachable in practice (file mode handled above), kept as a guard.
      return NextResponse.json(
        { error: "No account backend configured. Use local mode." },
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

    // Audit (Supabase path)
    const { getSessionAdmin: gsa } = await import("@/lib/session");
    const actingAdmin = await gsa(request);
    await recordAdminAction(request, actingAdmin, "user.create", "user", newUser.user?.id ?? null, `Created ${role || "student"} account ${email}`);

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
    const local = request.headers.get("x-local-mode") === "true";
    const body = await request.json();
    const userId = body.id;

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const { createClient, createAdminClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    if (local || !supabase) {
      // File mode: only a valid admin session may edit users.
      if (!(await getSessionAdmin(request))) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
      const users = readLocalUsers();
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

      // Never allow an admin to downgrade/remove the final built-in admin via PATCH role
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
      if (body.password) {
        user.password_hash = hashPassword(String(body.password));
        delete user.password;
      }

      writeLocalUsers(users);
      const admin = await getSessionAdmin(request);
      await recordAdminAction(request, admin, "user.update", "user", userId, `Updated account ${user.email}`);
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

    const actingAdmin = await getSessionAdmin(request);
    await recordAdminAction(request, actingAdmin, "user.update", "user", userId, `Updated account ${body.email || userId}${body.password ? " (password reset)" : ""}`);
    // A password reset invalidates every existing session for that account.
    if (body.password) await revokeAllForEmail(String(body.email || userId));
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
    const local = request.headers.get("x-local-mode") === "true";
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("id");

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const { createAdminClient } = await import("@/lib/supabase/server");
    const adminSupabase = await createAdminClient();

    if (local || !adminSupabase) {
      // File mode: only a valid admin session may delete users.
      if (!(await getSessionAdmin(request))) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
      const users = readLocalUsers();
      const target = users.find((u: any) => u.id === userId);
      if (!target) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      // Never allow deleting admin accounts from the local file.
      if (target.role === "admin") {
        return NextResponse.json(
          { error: "Admin accounts cannot be deleted" },
          { status: 400 }
        );
      }
      const filtered = users.filter((u: any) => u.id !== userId);
      writeLocalUsers(filtered);

      // Clean up the deleted user's data so their attempts/notifications
      // don't linger as orphans in leaderboards and the admin inbox.
      try {
        const { readServerAttempts, writeServerAttempts } = await import("@/lib/data");
        const attempts = readServerAttempts().filter(
          (a: any) => a.participant_id !== userId && a.participant_email !== target.email
        );
        writeServerAttempts(attempts);
      } catch { /* non-fatal */ }
      try {
        const notifsPath = join(process.cwd(), ".ollin-notifications.json");
        if (existsSync(notifsPath)) {
          const notifs = JSON.parse(readFileSync(notifsPath, "utf-8"));
          writeFileSync(
            notifsPath,
            JSON.stringify(notifs.filter((n: any) => n.user_id !== userId), null, 2)
          );
        }
      } catch { /* non-fatal */ }
      try {
        const savedPath = join(process.cwd(), ".ollin-saved-quizzes.json");
        if (existsSync(savedPath)) {
          const saved = JSON.parse(readFileSync(savedPath, "utf-8"));
          writeFileSync(
            savedPath,
            JSON.stringify(saved.filter((s: any) => s.user_id !== userId), null, 2)
          );
        }
      } catch { /* non-fatal */ }

      const admin = await getSessionAdmin(request);
      await recordAdminAction(request, admin, "user.delete", "user", userId, `Deleted account ${target.email}`);
      return NextResponse.json({ success: true, message: "User deleted" });
    }

    const { error } = await adminSupabase.auth.admin.deleteUser(userId);
    if (error) throw error;

    const actingAdmin = await getSessionAdmin(request);
    await recordAdminAction(request, actingAdmin, "user.delete", "user", userId, `Deleted account ${userId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete user" },
      { status: 500 }
    );
  }
}
