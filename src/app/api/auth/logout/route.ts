import { NextResponse } from "next/server";

export async function POST() {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase.auth.signOut();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}
