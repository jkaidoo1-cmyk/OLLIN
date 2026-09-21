import { NextRequest, NextResponse } from "next/server";
import { getSessionAdmin } from "@/lib/session";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { recordAdminAction } from "@/lib/audit";

/**
 * GET   /api/admin/audit — admin-only feed of recorded admin actions.
 * DELETE /api/admin/audit?id=<id> — delete a single event.
 * DELETE /api/admin/audit?all=true — clear the whole log.
 * Reads/writes Supabase when configured; falls back to the server file.
 */

const AUDIT_PATH = () => join(process.cwd(), ".ollin-audit.json");

export async function DELETE(request: NextRequest) {
  const admin = await getSessionAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("id");
  const clearAll = request.nextUrl.searchParams.get("all") === "true";
  if (!clearAll && !id) {
    return NextResponse.json({ error: "Specify ?id=<event id> or ?all=true" }, { status: 400 });
  }

  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const client = await createAdminClient();
    if (client) {
      const query = client.from("audit_log").delete();
      const { error } = clearAll
        ? await query.neq("id", "") // delete all rows
        : await query.eq("id", id!);
      if (error) throw new Error(error.message);
    } else {
      // File fallback
      if (!existsSync(AUDIT_PATH())) {
        return NextResponse.json({ deleted: 0, events: [] });
      }
      const events: Array<{ id: string }> = JSON.parse(readFileSync(AUDIT_PATH(), "utf-8"));
      const kept = clearAll ? [] : events.filter((e) => e.id !== id);
      writeFileSync(AUDIT_PATH(), JSON.stringify(kept, null, 2));
    }

    // Record the clear itself (except when it would be the only survivor of
    // its own clear — clearing writes the marker AFTER wiping).
    await recordAdminAction(
      request,
      admin,
      clearAll ? "audit.clear" : "audit.delete",
      "audit",
      clearAll ? null : id,
      clearAll ? "Cleared the entire activity log" : `Deleted activity entry ${id}`
    );

    // Return the fresh feed so the UI can update in one round-trip
    let events: unknown[] = [];
    if (client) {
      const { data } = await client
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      events = data || [];
    } else if (existsSync(AUDIT_PATH())) {
      events = JSON.parse(readFileSync(AUDIT_PATH(), "utf-8")).slice(-500).reverse();
    }
    return NextResponse.json({ ok: true, events });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete audit entries" },
      { status: 500 }
    );
  }
}

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
