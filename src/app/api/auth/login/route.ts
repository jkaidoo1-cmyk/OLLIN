import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, demo } = body;

    // Demo mode login
    if (demo) {
      return NextResponse.json({
        user: {
          id: "demo-user-001",
          email: "demo@ollin.app",
          full_name: "Alex Student",
          role: "student",
        },
        demo: true,
      });
    }

    // Admin demo login
    if (email === "jkaidoo1@mail.com" && password === "OllinAdmin1598") {
      return NextResponse.json({
        user: {
          id: "admin-001",
          email: "jkaidoo1@mail.com",
          full_name: "Admin User",
          role: "admin",
        },
        demo: true,
      });
    }

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Real Supabase login
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: data.user.user_metadata?.full_name || null,
        role: "student",
      },
      session: data.session,
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Login failed" },
      { status: 500 }
    );
  }
}
