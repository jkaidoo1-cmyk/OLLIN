import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { checkThrottle } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Public support endpoint — powers the "Help desk / Contact admin" form.
 *
 * Anyone (logged-in or guest) can send a message; it is delivered into the
 * notification stream of every admin account, where the admin overview's
 * "Support requests" card surfaces it. No auth required, but per-IP throttled
 * and length-capped to prevent abuse.
 */

const USERS_PATH = () => join(process.cwd(), ".ollin-users.json");

function readFileAdminIds(): string[] {
  try {
    if (existsSync(USERS_PATH())) {
      const users = JSON.parse(readFileSync(USERS_PATH(), "utf-8"));
      const ids = (users as Array<{ id: string; role?: string }>)
        .filter((u) => u.role === "admin")
        .map((u) => u.id);
      if (ids.length) return ids;
    }
  } catch { /* ignore */ }
  return ["admin-001"]; // built-in admin
}

async function resolveAdminIds(): Promise<string[]> {
  // Supabase mode first: real admin profiles
  try {
    const admin = await createAdminClient();
    if (admin) {
      const { data } = await admin
        .from("profiles")
        .select("id")
        .eq("role", "admin");
      if (data && data.length) return data.map((p: { id: string }) => p.id);
    }
  } catch { /* fall through to file mode */ }
  return readFileAdminIds();
}

const clamp = (v: unknown, max: number) =>
  String(v ?? "").trim().slice(0, max);

export async function POST(request: NextRequest) {
  const throttle = checkThrottle(request, "support", 5, 10 * 60_000);
  if (throttle.blocked) {
    return NextResponse.json(
      { error: throttle.message },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    let name = clamp(body.name, 80);
    let contact = clamp(body.contact, 120);

    // Logged-in senders are always identifiable, even if they leave the
    // name/contact fields blank — the account identity travels with it.
    const session = await getSessionUser(request);
    if (session) {
      let fullName = "";
      try {
        const { readLocalUsers } = await import("@/lib/local-users-store");
        fullName = readLocalUsers().find((u) => u.id === session.id)?.full_name || "";
      } catch { /* non-local session (Supabase) — fall back to email */ }
      if (!name) name = fullName || session.email;
      if (!contact) contact = session.email;
    }

    name = name || "Anonymous";
    const subject = clamp(body.subject, 120) || "General";
    const message = clamp(body.message, 2000);

    if (message.length < 2) {
      return NextResponse.json(
        { error: "Please write your message before sending." },
        { status: 400 }
      );
    }

    const title = `Support: ${subject}`;
    const full = contact
      ? `${message}\n\n— ${name} (${contact})`
      : `${message}\n\n— ${name}`;

    const adminIds = await resolveAdminIds();

    // Supabase first (persistent across deploys)
    try {
      const supabaseAdmin = await createAdminClient();
      if (supabaseAdmin) {
        const { error } = await supabaseAdmin.from("notifications").insert(
          adminIds.map((user_id) => ({ user_id, title, message: full, type: "system" }))
        );
        if (!error) return NextResponse.json({ ok: true });
      }
    } catch { /* fall through to file mode */ }

    // File mode fallback
    const notifsPath = join(process.cwd(), ".ollin-notifications.json");
    let notifs: Array<Record<string, unknown>> = [];
    try {
      if (existsSync(notifsPath)) {
        notifs = JSON.parse(readFileSync(notifsPath, "utf-8"));
      }
    } catch { notifs = []; }

    const now = new Date().toISOString();
    for (const user_id of adminIds) {
      notifs.unshift({
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        user_id,
        title,
        message: full,
        type: "system",
        read: false,
        created_at: now,
      });
    }
    try {
      writeFileSync(notifsPath, JSON.stringify(notifs, null, 2));
    } catch { /* read-only fs — Supabase is the persistent store */ }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not send your message. Please try again." },
      { status: 500 }
    );
  }
}
