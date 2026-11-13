/**
 * Client-side error text. Browser errors ("Failed to fetch", "Load failed",
 * aborts) mean nothing to a student mid-quiz, so they are translated here.
 *
 * Safe to import in client components — no server-only dependencies.
 */

export interface ApiErrorBody {
  error?: string;
  code?: string;
  hint?: string;
  reference?: string;
}

/** True for errors that mean "the request never got an answer". */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  return (
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("fetch failed")
  );
}

/**
 * Turn whatever was thrown into one sentence a person can act on.
 * `fallback` is used for anything unrecognised.
 */
export function toUserMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (isNetworkError(err)) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  if (err instanceof Error && err.message) {
    // API messages are already written for humans; keep them.
    return err.message;
  }
  return fallback;
}

/** Plain-language fallback for an HTTP status when the body had no message. */
export function statusMessage(status: number): string {
  if (status === 401) return "Please sign in to continue.";
  if (status === 403) return "You don't have access to this. Ask the quiz owner or an administrator.";
  if (status === 404) return "We couldn't find that — it may have been deleted.";
  if (status === 409) return "That already happened. Refresh the page to see the latest.";
  if (status === 413) return "That file is too large. Try a smaller one.";
  if (status === 422) return "That didn't pass validation. Please check the details and try again.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status === 507) return "This deployment can't save data right now. Please try again shortly.";
  if (status >= 500) return "The server had a problem. Please try again in a moment.";
  return "Something went wrong. Please try again.";
}

/**
 * Read an API error response into a message, keeping the hint (and reference)
 * when the server sent one.
 */
export async function readApiError(res: Response, fallback?: string): Promise<string> {
  let body: ApiErrorBody = {};
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    /* non-JSON response (proxy, crash page) */
  }
  const base = body.error || fallback || statusMessage(res.status);
  return body.hint ? `${base} ${body.hint}` : base;
}

export interface ApiResult<T = Record<string, unknown>> {
  status: number;
  body: T;
}

/**
 * Read a response that may be plain JSON or the keep-alive stream used by
 * endpoints that do slow work (see `lib/keep-alive.ts`): blank heartbeat lines
 * first, then one final `{ status, body }` line. Both shapes come back as the
 * same `{ status, body }`, so callers test the status once, wherever it lives.
 */
export async function readApiResult<T = Record<string, unknown>>(
  res: Response
): Promise<ApiResult<T>> {
  const contentType = res.headers.get("content-type") || "";
  if (!res.body || !contentType.includes("ndjson")) {
    let body: T;
    try {
      body = (await res.json()) as T;
    } catch {
      body = {} as T;
    }
    return { status: res.status, body };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastLine = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) lastLine = line;
      newline = buffer.indexOf("\n");
    }
  }

  const tail = buffer.trim();
  if (tail) lastLine = tail;
  if (!lastLine) {
    throw new Error("The server stopped before it finished. Please try again.");
  }

  const envelope = JSON.parse(lastLine) as { status?: number; body?: T };
  return { status: envelope.status ?? 200, body: (envelope.body ?? {}) as T };
}
