import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    // Get profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userData.user.id)
      .single();

    return NextResponse.json({
      user: profile || {
        id: userData.user.id,
        email: userData.user.email,
        full_name: userData.user.user_metadata?.full_name || null,
        role: "student",
      },
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
