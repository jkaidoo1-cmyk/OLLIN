import { NextResponse } from "next/server";

/**
 * One vocabulary for everything the API tells a user.
 *
 * Rules this file encodes:
 *  - The message says what happened and what the person can DO about it.
 *  - Raw database, stack or module text never reaches the browser; it goes to
 *    the server log with the same short reference the user sees, so support can
 *    match a complaint to an entry.
 *  - Every error carries a stable machine code, so the UI can branch without
 *    matching on prose.
 */

export type ErrorCode =
  | "auth_required"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "conflict"
  | "rate_limited"
  | "storage_unavailable"
  | "service_unavailable"
  | "server_error";

const DEFAULTS: Record<ErrorCode, { status: number; message: string }> = {
  auth_required: { status: 401, message: "Please sign in to continue." },
  forbidden: {
    status: 403,
    message: "You don't have access to this. Ask the quiz owner or an administrator.",
  },
  not_found: {
    status: 404,
    message: "We couldn't find that — it may have been deleted or the link is wrong.",
  },
  invalid_request: { status: 400, message: "Something in that request wasn't quite right. Please check it and try again." },
  conflict: { status: 409, message: "That isn't possible right now. Refresh the page and try again." },
  rate_limited: { status: 429, message: "That's a lot of requests. Please wait a moment and try again." },
  storage_unavailable: {
    status: 507,
    message: "We couldn't save that just now. Nothing was saved — please try again in a moment.",
  },
  service_unavailable: {
    status: 503,
    message: "The service is temporarily unavailable. Please try again in a moment.",
  },
  server_error: {
    status: 500,
    message: "Something went wrong on our side. Please try again — if it keeps happening, contact your administrator.",
  },
};

/** Short, quotable id so a user's report can be matched to a log line. */
export function errorRef(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** A user-facing error response. `message` overrides the default for the code. */
export function userError(
  code: ErrorCode,
  options: { message?: string; hint?: string; status?: number; extra?: Record<string, unknown> } = {}
) {
  const base = DEFAULTS[code];
  return NextResponse.json(
    {
      error: options.message ?? base.message,
      code,
      ...(options.hint ? { hint: options.hint } : {}),
      ...(options.extra ?? {}),
    },
    { status: options.status ?? base.status }
  );
}

/**
 * Log the real failure and return a friendly message plus a reference the user
 * can quote. Use this in catch blocks instead of returning error.message.
 */
export function serverError(
  context: string,
  err: unknown,
  options: { code?: ErrorCode; message?: string; hint?: string } = {}
) {
  const ref = errorRef();
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(`[${relative(context)}] ref=${ref}: ${detail}`);
  const code = options.code ?? "server_error";
  const base = DEFAULTS[code];
  return userError(code, {
    message: options.message,
    hint:
      options.hint ??
      `If you contact support, mention reference ${ref}.`,
    extra: { reference: ref },
  });
}

function relative(context: string): string {
  return context || "api";
}

/**
 * Map a database/HTTP failure to the most accurate user-facing code, so the
 * same helper can be reused in routes that talk to different backends.
 */
export function classify(error: unknown): ErrorCode {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (msg.includes("no service configured") || msg.includes("not configured")) return "service_unavailable";
  if (msg.includes("does not exist") || msg.includes("relation") || msg.includes("permission denied")) {
    return "storage_unavailable";
  }
  if (msg.includes("duplicate key") || msg.includes("already exists")) return "conflict";
  if (msg.includes("invalid input syntax") || msg.includes("violates") || msg.includes("null value")) {
    return "invalid_request";
  }
  if (msg.includes("rate") || msg.includes("429") || msg.includes("limit")) return "rate_limited";
  if (msg.includes("timed out") || msg.includes("timeout") || msg.includes("fetch failed")) {
    return "service_unavailable";
  }
  return "server_error";
}
