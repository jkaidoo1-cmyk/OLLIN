import { NextRequest } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * Admin audit log — records every admin mutation (who, what, when) to
 * Supabase when configured, and a server-side JSON file as fallback.
 * Insert-only; failures never block the admin operation itself.
 */

interface AuditEvent {
  id: string;
  at: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;          // e.g. "user.create", "course.delete", "key.add"
  target_type: string;     // "user" | "course" | "program" | "quiz" | "api_key" | "settings"
  target_id: string | null;
  detail: string;          // short human-readable summary
}

const AUDIT_PATH = () => join(process.cwd(), ".ollin-audit.json");

function readAuditFile(): AuditEvent[] {
  try {
    if (existsSync(AUDIT_PATH())) {
      return JSON.parse(readFileSync(AUDIT_PATH(), "utf-8"));
    }
  } catch { /* ignore */ }
  return [];
}

function appendAuditFile(events: AuditEvent[]) {
  try {
    // Trimmed to the last 5000 events; Supabase is the persistent store
    writeFileSync(AUDIT_PATH(), JSON.stringify(events.slice(-5000), null, 2));
  } catch { /* read-only fs (Vercel) */ }
}

/** Extract the request IP best-effort (Vercel sets x-forwarded-for). */
export function clientIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

/**
 * Record an admin action. Fire-and-forget by design — audit failures are
 * swallowed but never block the operation that triggered them.
 */
export async function recordAdminAction(
  request: NextRequest,
  actor: { id: string; email: string } | null,
  action: string,
  targetType: AuditEvent["target_type"],
  targetId: string | null,
  detail: string
): Promise<void> {
  const event: AuditEvent = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    actor_id: actor?.id ?? null,
    actor_email: actor?.email ?? null,
    action,
    target_type: targetType,
    target_id: targetId,
    detail,
  };

  // Supabase first
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const admin = await createAdminClient();
    if (admin) {
      const { error } = await admin.from("audit_log").insert({
        id: event.id,
        actor_id: event.actor_id,
        actor_email: event.actor_email,
        action: event.action,
        target_type: event.target_type,
        target_id: event.target_id,
        detail: event.detail,
        ip: clientIp(request),
      });
      if (!error) return;
    }
  } catch { /* fall through to file */ }

  appendAuditFile([...readAuditFile(), event]);
}
