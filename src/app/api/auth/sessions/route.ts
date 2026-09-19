import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, revokeAllUserSessions, createLogoutCookie } from "@/lib/session";

/** POST /api/auth/sessions — revoke ALL sessions for the logged-in user. */
export async function POST(request: NextRequest) {
  const session = await getSessionUser(request);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const count = await revokeAllUserSessions(session.id);
  const res = NextResponse.json({
    ok: true,
    revoked: count,
    message: `${count} session(s) revoked. Log in again on every device.`,
  });
  res.headers.append("Set-Cookie", createLogoutCookie());
  return res;
}
