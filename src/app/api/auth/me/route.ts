import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    // The app issues its own signed session cookie (ollin_session) on login,
    // regardless of whether Supabase is configured. Check that first so the
    // cookie works in both local and Supabase mode.
    const { getSessionUserFromCookieStore } = await import("@/lib/session");
    const sessionUser = await getSessionUserFromCookieStore();
    if (sessionUser) {
      const { readLocalUsers } = await import("@/lib/local-users-store");
      const stored = readLocalUsers().find((u) => u.id === sessionUser.id);
      // If the user isn't in the local file, try Supabase profiles (migrated users).
      let profile = stored;
      if (!profile) {
        try {
          const supabase = await createClient();
          if (supabase) {
            const { data, error } = await supabase
              .from("profiles")
              .select("id, email, full_name, role, program_id, current_year")
              .eq("id", sessionUser.id)
              .single();
            if (!error && data) profile = data;
          }
        } catch { /* Supabase unreachable — trust the signed cookie */ }
      }
      return NextResponse.json({
        user: {
          id: sessionUser.id,
          email: sessionUser.email,
          full_name: profile?.full_name || sessionUser.email.split("@")[0],
          role: profile?.role || sessionUser.role || "student",
          program_id: (profile as any)?.program_id ?? null,
          current_year: (profile as any)?.current_year ?? 1,
        },
        local: true,
      });
    }

    // Fallback: Supabase auth cookie (for native Supabase logins, if any).
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name, role")
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
