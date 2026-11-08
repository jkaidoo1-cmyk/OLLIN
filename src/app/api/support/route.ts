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
  // Union of both admin populations: Supabase profiles (uuid) and the local
  // account file ("admin-001"). Returning only the Supabase list meant a
  // support message never reached a local-mode admin.
  const ids = new Set<string>();
  try {
    const admin = await createAdminClient();
    if (admin) {
      const { data } = await admin
        .from("profiles")
        .select("id")
        .eq("role", "admin");
      for (const p of data || []) ids.add((p as { id: string }).id);
    }
  } catch { /* file list below still applies */ }
  for (const id of readFileAdminIds()) ids.add(id);
  return [...ids];
}

const clamp = (v: unknown, max: number) =>
  String(v ?? "").trim().slice(0, max);

// notifications.sender_id is a uuid referencing profiles; local-mode accounts
// ("demo-001") have string ids. Sending one made the whole insert fail, which
// silently pushed the message into a file store no Supabase admin ever reads.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuidOrNull = (value: string | undefined | null) =>
  value && UUID_RE.test(value) ? value : null;

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
    // Logged-in senders: sign with the name only — their email rides in the
    // notification's sender_email metadata (that's what routes the admin's
    // reply), so printing it in the body just leaks it into the UI.
    const full = !session && contact
      ? `${message}\n\n— ${name} (${contact})`
      : `${message}\n\n— ${name}`;

    const adminIds = await resolveAdminIds();

    // Two admin populations exist: Supabase profiles (uuid ids, read the table)
    // and local accounts like "admin-001" (read the file store). A message has
    // to reach both, otherwise it is invisible to whichever admins use the
    // other store — which is exactly what happened when only Supabase was
    // written and the signed-in admin was a local account.
    const uuidAdminIds = adminIds.filter((id) => UUID_RE.test(id));
    let fileAdminIds = adminIds.filter((id) => !UUID_RE.test(id));
    let supabaseDelivered = false;

    // Supabase first (persistent across deploys)
    try {
      const supabaseAdmin = await createAdminClient();
      if (supabaseAdmin && uuidAdminIds.length) {
        const { error } = await supabaseAdmin.from("notifications").insert(
          uuidAdminIds.map((user_id) => ({
            user_id, title, message: full, type: "system",
            // Sender identity — routes the admin's reply back in-app.
            sender_id: asUuidOrNull(session?.id),
            sender_email: session?.email || (contact && contact.includes("@") ? contact : null),
            sender_name: name,
          }))
        );
        supabaseDelivered = !error;
      }
    } catch { /* fall through to file mode */ }

    // No Supabase delivery (unconfigured or failed): every admin reads the file.
    if (!supabaseDelivered) fileAdminIds = adminIds;

    // File mode fallback
    const notifsPath = join(process.cwd(), ".ollin-notifications.json");
    let notifs: Array<Record<string, unknown>> = [];
    try {
      if (existsSync(notifsPath)) {
        notifs = JSON.parse(readFileSync(notifsPath, "utf-8"));
      }
    } catch { notifs = []; }

    const now = new Date().toISOString();
    // Sender identity — lets the admin's reply be routed back in-app.
    const senderMeta: Record<string, string | null> = session
      ? { sender_id: session.id, sender_email: session.email, sender_name: name }
      : { sender_id: null, sender_email: contact && contact.includes("@") ? contact : null, sender_name: name };
    for (const user_id of fileAdminIds) {
      notifs.unshift({
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        user_id,
        title,
        message: full,
        type: "system",
        read: false,
        created_at: now,
        ...senderMeta,
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
