import { NextRequest, NextResponse } from "next/server";
import { readDemoUsers, publicUser } from "@/lib/demo-users-store";

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

    // Demo login — verify against the server-side users file so accounts
    // created by an admin can log in from any browser. Try this first: it is
    // the de-facto account store for this platform. Supabase is used only as
    // an optional fallback when the demo check fails and it is configured.
    const users = readDemoUsers();
    const user = users.find(
      (u) => u.email.toLowerCase() === String(email).toLowerCase() && u.password === password
    );
    if (user) {
      return NextResponse.json({ user: publicUser(user), demo: true });
    }

    // Demo-flag logins never fall through to Supabase.
    if (demo) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    // Real Supabase login
    const supabase = await import("@/lib/supabase/server").then((m) => m.createClient());
    if (!supabase) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // Look up the role from profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", data.user.id)
      .single();

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: profile?.full_name || data.user.user_metadata?.full_name || null,
        role: profile?.role || "student",
      },
      session: data.session,
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
