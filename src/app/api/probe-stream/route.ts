import { NextRequest } from "next/server";

// TEMPORARY diagnostic route — delete once the latency question is answered.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const ms = Math.min(Number(new URL(request.url).searchParams.get("ms") || 15000), 55000);
  const startedAt = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: string) => {
        try {
          controller.enqueue(encoder.encode(`${Date.now() - startedAt} ${line}\n`));
        } catch {
          /* client is gone */
        }
      };
      send("start");
      const timer = setInterval(() => send("beat"), 1000);
      await new Promise((resolve) => setTimeout(resolve, ms));
      clearInterval(timer);
      send("done");
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
