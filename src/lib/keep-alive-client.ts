/**
 * Read a response that may have been streamed through `keepAliveResponse`.
 *
 * Long handlers start the response immediately and send heartbeats, so the
 * body is newline-delimited: blank lines, then one JSON envelope
 * `{ status, body }`. A normal JSON response is handled too, so callers do not
 * need to know which shape a route uses.
 */
export async function readJsonResponse(
  res: Response
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) return { ok: res.ok, status: res.status, data: {} };

  const lastLine = trimmed.split("\n").filter((line) => line.trim()).pop() || trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(lastLine);
  } catch {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return {
        ok: false,
        status: res.status,
        data: { error: "The server sent an unreadable response. Please try again." },
      };
    }
  }

  // keepAliveResponse wraps the real status and body in an envelope.
  if (
    parsed &&
    typeof parsed === "object" &&
    "status" in parsed &&
    "body" in parsed &&
    typeof (parsed as { status: unknown }).status === "number"
  ) {
    const envelope = parsed as { status: number; body: Record<string, unknown> };
    return {
      ok: envelope.status >= 200 && envelope.status < 300,
      status: envelope.status,
      data: (envelope.body || {}) as Record<string, unknown>,
    };
  }

  return { ok: res.ok, status: res.status, data: (parsed || {}) as Record<string, unknown> };
}
