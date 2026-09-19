import { NextRequest, NextResponse } from "next/server";
import { readDemoUsers, publicUser, verifyPassword, hashPassword } from "@/lib/demo-users-store";
import { createSessionCookie } from "@/lib/session";
import { ADMIN_PASSWORD } from "@/lib/demo-constants";
import { checkRateLimit, recordFailure, recordSuccess } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, demo } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Brute-force protection: escalating backoff per IP after repeated failures.
    const limit = checkRateLimit(request, "login");
    if (limit.blocked) {
      return NextResponse.json(
        { error: limit.message },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    // Demo login — verify against the server-side users file so accounts
    // created by an admin can log in from any browser. Try this first: it is
    // the de-facto account store for this platform. Supabase is used only as
    // an optional fallback when the demo check fails and it is configured.
    const users = readDemoUsers();
    let usersChanged = false;
    const user = users.find((u) => u.email.toLowerCase() === String(email).toLowerCase());
    const authed = !!user && verifyPassword(password, user);
    // The built-in admin account always accepts ADMIN_PASSWORD: if the stored
    // hash is out of sync (e.g. pre-hash legacy file), re-sync it.
    if (!authed && user && user.id === "admin-001" && password === ADMIN_PASSWORD) {
      user.password_hash = hashPassword(password);
      delete user.password;
      usersChanged = true;
    } else if (authed && user?.password_hash) {
      usersChanged = !!user.password; // plaintext was upgraded during verify
    }
    if (usersChanged) {
      const { writeDemoUsers } = await import("@/lib/demo-users-store");
      writeDemoUsers(users);
    }
    if (user && authed) {
      recordSuccess(request, "login");
      const res = NextResponse.json({ user: publicUser(user), demo: true });
      res.headers.append(
        "Set-Cookie",
        createSessionCookie({ id: user.id, email: user.email, role: user.role || "student" })
      );
      return res;
    }

    // Demo-flag logins never fall through to Supabase.
    if (demo) {
      recordFailure(request, "login");
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    // Real Supabase login
    const supabase = await import("@/lib/supabase/server").then((m) => m.createClient());
    if (!supabase) {
      recordFailure(request, "login");
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Backend availability issues were already filtered out by createClient()
      // returning null — anything here is a genuine credential problem.
      recordFailure(request, "login");
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    // Look up the role from profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", data.user.id)
      .single();

    const res = NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: profile?.full_name || data.user.user_metadata?.full_name || null,
        role: profile?.role || "student",
      },
      session: data.session,
    });
    // Also issue the app session cookie so admin/config APIs accept this login.
    res.headers.append(
      "Set-Cookie",
      createSessionCookie({
        id: data.user.id,
        email: data.user.email || email,
        role: (profile?.role as "admin" | "student") || "student",
      })
    );
    return res;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
