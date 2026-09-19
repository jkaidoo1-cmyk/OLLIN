import { NextRequest, NextResponse } from "next/server";
import { getSessionAdmin } from "@/lib/session";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * GET /api/admin/audit — admin-only feed of recorded admin actions.
 * Reads from Supabase when configured; falls back to the server file.
 */

const AUDIT_PATH = () => join(process.cwd(), ".ollin-audit.json");

export async function GET(request: NextRequest) {
  const admin = await getSessionAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const client = await createAdminClient();
    if (client) {
      const { data, error } = await client
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return NextResponse.json({ events: data || [] });
    }

    // File fallback
    const path = AUDIT_PATH();
    if (existsSync(path)) {
      const events = JSON.parse(readFileSync(path, "utf-8"));
      return NextResponse.json({ events: events.slice(-500).reverse() });
    }
    return NextResponse.json({ events: [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load audit log" },
      { status: 500 }
    );
  }
}
