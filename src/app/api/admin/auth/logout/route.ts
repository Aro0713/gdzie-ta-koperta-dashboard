import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, getAdminCookieOptions } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true, message: "Wylogowano pomyślnie." });
  res.cookies.set(ADMIN_SESSION_COOKIE, "", getAdminCookieOptions(0));
  return res;
}
