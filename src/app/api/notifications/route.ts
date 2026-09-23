import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Server-backed notifications.
 *
 * Replaces the localStorage-only notification store. Works in both backends:
 *   - Supabase configured → persists to the public.notifications table
 *   - File mode           → per-user JSON file keyed by user id
 *
 * Only GET (list own), PATCH (mark read), POST (create — session-authed), and
 * DELETE (remove own) are supported. Admin bulk-notify flows through POST
 * with explicit recipient resolution.
 */

const NOTIFS_PATH = () => join(process.cwd(), ".ollin-notifications.json");

interface StoredNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: "quiz" | "result" | "system";
  read: boolean;
  created_at: string;
  /** Support-message sender identity (optional) — routes admin replies in-app. */
  sender_id?: string | null;
  sender_email?: string | null;
  sender_name?: string;
}

export function readNotifsFile(): StoredNotification[] {
  try {
    const path = NOTIFS_PATH();
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
  } catch { /* ignore */ }
  return [];
}

export function writeNotifsFile(notifs: StoredNotification[]) {
  try {
    writeFileSync(NOTIFS_PATH(), JSON.stringify(notifs, null, 2));
  } catch { /* read-only fs (Vercel) — Supabase is the persistent store */ }
}

async function notifySupabase(
  userIds: string[],
  n: { title: string; message: string; type: string }
): Promise<boolean> {
  const admin = await createAdminClient();
  if (!admin) return false;
  const rows = userIds.map((user_id) => ({
    user_id,
    title: n.title,
    message: n.message,
    type: n.type,
  }));
  const { error } = await admin.from("notifications").insert(rows);
  return !error;
}

// GET — list the current user's notifications
export async function GET(request: NextRequest) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const admin = await createAdminClient();
    if (admin) {
      const { data, error } = await admin
        .from("notifications")
        .select("*")
        .eq("user_id", session.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return NextResponse.json({ notifications: data || [] });
    }
    const mine = readNotifsFile()
      .filter((n) => n.user_id === session.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return NextResponse.json({ notifications: mine });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load notifications" },
      { status: 500 }
    );
  }
}

// POST — create notifications (session-authed; used by quiz/attempt flows)
export async function POST(request: NextRequest) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const title = String(body.title || "").trim();
    const message = String(body.message || "").trim();
    const type = ["quiz", "result", "system"].includes(body.type) ? body.type : "system";
    const userIds: string[] = Array.isArray(body.user_ids)
      ? body.user_ids.map(String)
      : [String(body.user_id || session.id)];

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const ok = await notifySupabase(userIds, { title, message, type });
    if (ok) return NextResponse.json({ message: "Notification sent" });

    // File mode
    const notifs = readNotifsFile();
    for (const user_id of userIds) {
      notifs.unshift({
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        user_id,
        title,
        message,
        type,
        read: false,
        created_at: new Date().toISOString(),
      });
    }
    writeNotifsFile(notifs);
    return NextResponse.json({ message: "Notification sent" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send notification" },
      { status: 500 }
    );
  }
}

// PATCH — mark all (or one) of the current user's notifications read
export async function PATCH(request: NextRequest) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const id = body.id ? String(body.id) : null;

    const admin = await createAdminClient();
    if (admin) {
      let query = admin.from("notifications").update({ read: true }).eq("user_id", session.id);
      if (id) query = query.eq("id", id);
      const { error } = await query;
      if (error) throw new Error(error.message);
      return NextResponse.json({ message: "Marked read" });
    }

    const notifs = readNotifsFile();
    for (const n of notifs) {
      if (n.user_id === session.id && (!id || n.id === id)) n.read = true;
    }
    writeNotifsFile(notifs);
    return NextResponse.json({ message: "Marked read" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update" },
      { status: 500 }
    );
  }
}

// DELETE — remove one or all of the current user's notifications
export async function DELETE(request: NextRequest) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const all = searchParams.get("all") === "true";

    const admin = await createAdminClient();
    if (admin) {
      let query = admin.from("notifications").delete().eq("user_id", session.id);
      if (!all && id) query = query.eq("id", id);
      const { error } = await query;
      if (error) throw new Error(error.message);
      return NextResponse.json({ message: "Deleted" });
    }

    let notifs = readNotifsFile();
    notifs = notifs.filter((n) => {
      if (n.user_id !== session.id) return true;
      if (all) return false;
      return n.id !== id;
    });
    writeNotifsFile(notifs);
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete" },
      { status: 500 }
    );
  }
}
