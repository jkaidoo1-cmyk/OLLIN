import { NextResponse } from "next/server";
import { createLogoutCookie } from "@/lib/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", createLogoutCookie());
  return res;
}
