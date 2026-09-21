import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { checkThrottle } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Forgot-password request — public, unauthenticated.
 *
 * There is no email infrastructure, so the request is delivered into the
 * admin notification stream (same channel as the help desk). The admin then
 * resets the password from the Users page; the student is told to ask the
 * admin for their new password.
 *
 * The response is identical whether or not the account exists, so the
 * endpoint can't be used to enumerate accounts.
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
  return ["admin-001"];
}

async function resolveAdminIds(): Promise<string[]> {
  try {
    const admin = await createAdminClient();
    if (admin) {
      const { data } = await admin.from("profiles").select("id").eq("role", "admin");
      if (data && data.length) return data.map((p: { id: string }) => p.id);
    }
  } catch { /* fall through to file mode */ }
  return readFileAdminIds();
}

export async function POST(request: NextRequest) {
  // Strict throttle: 3 requests per IP per 15 minutes.
  const throttle = checkThrottle(request, "forgot-pw", 3, 15 * 60_000);
  if (throttle.blocked) {
    return NextResponse.json(
      { error: throttle.message },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase().slice(0, 120);
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Enter your school email address." }, { status: 400 });
    }

    // Uniform response regardless of account existence (no enumeration).
    const okResponse = {
      ok: true,
      message: "Request sent. Your admin will reset your password — ask them for the new one.",
    };

    const adminIds = await resolveAdminIds();
    const title = `Password reset: ${email}`;
    const message = `Password reset requested for this account. Reset it from the Users page and share the new password with the student.`;

    // Supabase first (persistent)
    try {
      const supabaseAdmin = await createAdminClient();
      if (supabaseAdmin) {
        const { error } = await supabaseAdmin.from("notifications").insert(
          adminIds.map((user_id) => ({ user_id, title, message, type: "system" }))
        );
        if (!error) return NextResponse.json(okResponse);
      }
    } catch { /* fall through */ }

    // File mode
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
        message,
        type: "system",
        read: false,
        created_at: now,
      });
    }
    try {
      writeFileSync(notifsPath, JSON.stringify(notifs, null, 2));
    } catch { /* read-only fs */ }

    return NextResponse.json(okResponse);
  } catch {
    return NextResponse.json(
      { error: "Could not send your request. Please try again." },
      { status: 500 }
    );
  }
}
