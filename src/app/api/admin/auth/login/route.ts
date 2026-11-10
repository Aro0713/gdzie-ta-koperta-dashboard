import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  getAdminCookieOptions,
  getAdminSecret,
  signAdminSession,
  timingSafeCompare,
  type AdminSession,
} from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password } = body;

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { ok: false, error: "Hasło jest wymagane." },
        { status: 400 }
      );
    }

    const secret = getAdminSecret();
    const isValid = await timingSafeCompare(password.trim(), secret.trim());

    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: "Nieprawidłowe hasło administratora." },
        { status: 401 }
      );
    }

    const session: AdminSession = {
      username: "admin_fallback",
      authMethod: "secret",
      issuedAt: Date.now(),
      expiresAt: Date.now() + ADMIN_SESSION_MAX_AGE * 1000,
    };

    const token = await signAdminSession(session);
    const res = NextResponse.json({
      ok: true,
      username: session.username,
      authMethod: session.authMethod,
      message: "Zalogowano pomyślnie hasłem awaryjnym.",
    });

    res.cookies.set(
      ADMIN_SESSION_COOKIE,
      token,
      getAdminCookieOptions(ADMIN_SESSION_MAX_AGE)
    );

    return res;
  } catch (err: any) {
    console.error("Admin login error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Błąd serwera." },
      { status: 500 }
    );
  }
}
