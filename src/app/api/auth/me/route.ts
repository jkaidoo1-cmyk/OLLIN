import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    if (!supabase) {
      // No Supabase configured — check the local session cookie instead.
      try {
        const { getSessionUserFromCookieStore } = await import("@/lib/session");
        const user = await getSessionUserFromCookieStore();
        if (user) return NextResponse.json({ user: { ...user, full_name: user.email }, local: true });
      } catch { /* ignore */ }
      return NextResponse.json({ user: null }, { status: 401 });
    }

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
