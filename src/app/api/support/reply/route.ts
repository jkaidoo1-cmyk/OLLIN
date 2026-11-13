import { NextRequest, NextResponse } from "next/server";
import { getSessionAdmin } from "@/lib/session";
import { readNotifsFile, writeNotifsFile } from "@/app/api/notifications/route";
import { isEphemeralHost } from "@/lib/server-host";

/**
 * POST /api/support/reply — admin answers a support message.
 *
 * The reply lands in the original sender's notification stream when the
 * sender was a logged-in user (their identity is stored on the message).
 * Guest messages have no in-app destination, so the admin replies via the
 * contact info the guest left — the endpoint reports that case clearly.
 *
 * Database first: on a serverless host the notification file is empty, so
 * reading it first found no original message and the reply was written to a
 * file nobody reads. Any Supabase-backed conversation is now answered there.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve an account (uuid) from a sender id or email, database first. */
async function resolveRecipient(
  senderId: string | null,
  senderEmail: string | null
): Promise<string | null> {
  if (senderId && UUID_RE.test(senderId)) return senderId;

  if (senderEmail) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const admin = await createAdminClient();
      if (admin) {
        const { data } = await admin
          .from("profiles")
          .select("id")
          .ilike("email", senderEmail)
          .maybeSingle();
        if (data?.id) return data.id;
      }
    } catch { /* fall through to the file store */ }
  }

  if (senderId) return senderId;

  if (senderEmail) {
    try {
      const { readLocalUsers } = await import("@/lib/local-users-store");
      const u = readLocalUsers().find(
        (x: { email?: string }) => x.email?.toLowerCase() === senderEmail.toLowerCase()
      );
      if (u?.id) return u.id;
    } catch { /* ignore */ }
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

    // ── Database path ──────────────────────────────────────
    try {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const supa = await createAdminClient();
      if (supa) {
        const { data: row } = await supa
          .from("notifications")
          .select("sender_id, sender_email, sender_name, title")
          .eq("id", notificationId)
          .maybeSingle();

        if (row) {
          const senderId: string | null = (row as any).sender_id ?? null;
          const senderEmail: string | null = (row as any).sender_email ?? null;
          const senderName: string =
            (row as any).sender_name || senderEmail || "there";
          const subject: string =
            String((row as any).title || "").replace(/^Support:\s*/, "") || "your message";

          const recipientId = await resolveRecipient(senderId, senderEmail);

          if (recipientId && UUID_RE.test(recipientId)) {
            const { error } = await supa.from("notifications").insert({
              user_id: recipientId,
              title: `Re: Support: ${subject}`,
              message: `${reply}\n\n— ${admin.email} (OLLIN admin)`,
              type: "system",
              read: false,
            });
            if (!error) {
              // Mark the original as handled.
              await supa.from("notifications").update({ read: true }).eq("id", notificationId);
              return NextResponse.json({ ok: true, delivered: "in_app", recipient: senderName });
            }
            return NextResponse.json(
              {
                error: `Could not deliver the reply: ${error.message}`,
                not_persisted: true,
              },
              { status: 507 }
            );
          }

          return NextResponse.json(
            {
              ok: false,
              delivered: "none",
              contact: senderEmail,
              error: "This student has no account to notify — reply via their contact info.",
            },
            { status: 200 }
          );
        }

        if (isEphemeralHost()) {
          return NextResponse.json(
            { error: "Could not find that support message in the database.", not_persisted: true },
            { status: 404 }
          );
        }
      }
    } catch { /* fall through to file mode */ }

    // ── File mode (local development) ──────────────────────
    const notifs = readNotifsFile();
    const original = notifs.find(
      (n: { id: string; title?: string }) =>
        n.id === notificationId && n.title?.startsWith("Support:")
    );
    const senderId: string | null = original?.sender_id ?? null;
    const senderEmail: string | null = original?.sender_email ?? null;
    const senderName: string = original?.sender_name || senderEmail || "there";
    const subject: string = original?.title?.replace(/^Support:\s*/, "") || "your message";

    const recipientId = await resolveRecipient(senderId, senderEmail);
    if (!recipientId) {
      return NextResponse.json(
        {
          ok: false,
          delivered: "none",
          contact: senderEmail,
          error: "This student has no account to notify — reply via their contact info.",
        },
        { status: 200 }
      );
    }

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
    const idx = notifs2.findIndex((n: { id: string }) => n.id === notificationId);
    if (idx >= 0) notifs2[idx].read = true;
    writeNotifsFile(notifs2);

    return NextResponse.json({ ok: true, delivered: "in_app", recipient: senderName });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send reply" },
      { status: 500 }
    );
  }
}
