import { NextRequest, NextResponse } from "next/server";

// TEMPORARY diagnostic route: does a slow response still get delivered?
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const delay = Math.min(50_000, Number(request.nextUrl.searchParams.get("ms") || 0));
  const started = Date.now();
  await new Promise((resolve) => setTimeout(resolve, delay));
  return NextResponse.json({ sleptMs: delay, elapsedMs: Date.now() - started, ok: true });
}
