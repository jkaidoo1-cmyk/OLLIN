/**
 * Long handlers on this host have to keep talking.
 *
 * A response that stays silent for more than a few seconds is dropped before it
 * ever reaches the browser (measured: no bytes in 5s, 8s, 12s, 15s, 30s -> never
 * answered, connection died at ~60s), while a response that has already started
 * streaming arrives fine at 45s. Question generation takes 5-50s, so it is
 * exactly that shape.
 *
 * Wrapping the handler here means the response starts at once with a blank
 * line, emits one per second while the work runs, and ends with a single JSON
 * envelope `{ status, body }`. The status lives in the envelope because the
 * real HTTP status is already 200 by the time the work finishes; any early
 * validation error is carried the same way, so the client has one decoder.
 */
const HEARTBEAT_MS = 1000;

export function keepAliveResponse(run: () => Promise<Response>): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (chunk: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          open = false; // client disconnected; the work itself may still finish
        }
      };

      write("\n");
      const beat = setInterval(() => write("\n"), HEARTBEAT_MS);

      let envelope: { status: number; body: unknown };
      try {
        const response = await run();
        const raw = await response.text();
        let body: unknown;
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          body = { error: raw };
        }
        envelope = { status: response.status, body };
      } catch (err) {
        // The handler's own catch normally produces this; this is the last net.
        console.error("[keep-alive] handler failed after the response started:", err);
        envelope = {
          status: 500,
          body: { error: "Something went wrong. Please try again in a moment." },
        };
      } finally {
        clearInterval(beat);
      }

      write(`${JSON.stringify(envelope)}\n`);
      open = false;
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
