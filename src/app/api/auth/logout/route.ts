import { NextRequest, NextResponse } from "next/server";
import { createLogoutCookie, revokeCurrentSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  // Kill the server-side session record so the cookie can't be replayed.
  await revokeCurrentSession(request);
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", createLogoutCookie());
  return res;
}
