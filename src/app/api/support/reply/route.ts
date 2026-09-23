import { NextRequest, NextResponse } from "next/server";
import { getSessionAdmin } from "@/lib/session";
import { readNotifsFile, writeNotifsFile } from "@/app/api/notifications/route";

/**
 * POST /api/support/reply — admin answers a support message.
 *
 * The reply lands in the original sender's notification stream when the
 * sender was a logged-in user (their identity is stored on the message).
 * Guest messages have no in-app destination, so the admin replies via the
 * contact info the guest left — the endpoint reports that case clearly.
 */

async function resolveRecipient(senderId: string | null, senderEmail: string | null): Promise<string | null> {
  if (senderId) return senderId;
  if (senderEmail) {
    // Match the sender's email to an account (file mode now; Supabase below).
    try {
      const { readLocalUsers } = await import("@/lib/local-users-store");
      const u = readLocalUsers().find((x: { email?: string }) => x.email?.toLowerCase() === senderEmail.toLowerCase());
      if (u) return u.id;
    } catch { /* fall through */ }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const admin = await getSessionAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const notificationId = String(body.notification_id || "");
    const reply = String(body.reply || "").trim();

    if (!notificationId) {
      return NextResponse.json({ error: "notification_id is required" }, { status: 400 });
    }
    if (reply.length < 1) {
      return NextResponse.json({ error: "Write a reply first." }, { status: 400 });
    }

    // Locate the original support message (file mode) to find its sender.
    const notifs = readNotifsFile();
    const original = notifs.find(
      (n: { id: string; title?: string }) => n.id === notificationId && n.title?.startsWith("Support:")
    );
    const senderId: string | null = original?.sender_id ?? null;
    const senderEmail: string | null = original?.sender_email ?? null;
    const senderName: string = original?.sender_name || senderEmail || "there";
    const subject: string = original?.title?.replace(/^Support:\s*/, "") || "your message";

    const recipientId = await resolveRecipient(senderId, senderEmail);

    // Supabase path — sender identity lives on the notification row.
    if (!recipientId) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/server");
        const supa = await createAdminClient();
        if (supa) {
          let row: { sender_id: string | null; sender_email: string | null } | null = null;
          if (notificationId) {
            const { data } = await supa
              .from("notifications")
              .select("sender_id, sender_email")
              .eq("id", notificationId)
              .maybeSingle();
            row = data || null;
          }
          const rid = await resolveRecipient(row?.sender_id ?? null, row?.sender_email ?? null);
          if (rid) {
            const { error } = await supa.from("notifications").insert({
              user_id: rid,
              title: `Re: Support: ${subject}`,
              message: `${reply}\n\n— ${admin.email} (OLLIN admin)`,
              type: "system",
            });
            if (!error) {
              // Mark the original as handled.
              await supa.from("notifications").update({ read: true }).eq("id", notificationId);
              return NextResponse.json({ ok: true, delivered: "in_app" });
            }
          }
          return NextResponse.json(
            { ok: false, delivered: "none", contact: row?.sender_email || senderEmail || null,
              error: "This student has no account to notify — reply via their contact info." },
            { status: 200 }
          );
        }
      } catch { /* fall through to file-mode result below */ }
    }

    if (!recipientId) {
      return NextResponse.json(
        { ok: false, delivered: "none", contact: senderEmail,
          error: "This student has no account to notify — reply via their contact info." },
        { status: 200 }
      );
    }

    // File mode: insert the reply notification for the sender.
    const notifs2 = readNotifsFile();
    notifs2.unshift({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: recipientId,
      title: `Re: Support: ${subject}`,
      message: `${reply}\n\n— ${admin.email} (OLLIN admin)`,
      type: "system",
      read: false,
      created_at: new Date().toISOString(),
    });
    // Mark the original handled.
    const idx = notifs2.findIndex((n: { id: string }) => n.id === notificationId);
    if (idx >= 0) notifs2[idx].read = true;
    writeNotifsFile(notifs2);

    return NextResponse.json({ ok: true, delivered: "in_app", recipient: senderName });
  } catch {
    return NextResponse.json({ error: "Could not send the reply. Please try again." }, { status: 500 });
  }
}
