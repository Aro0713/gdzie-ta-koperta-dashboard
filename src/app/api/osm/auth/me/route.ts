import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  OSM_SESSION_COOKIE,
  decryptSession,
  getBearerSessionFromAuthorization,
  isSessionValid
} from "@/lib/osmOAuth";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const rawCookieSession = cookieStore.get(OSM_SESSION_COOKIE)?.value;
  const rawBearerSession = getBearerSessionFromAuthorization(
    request.headers.get("Authorization")
  );
  const rawSession = rawBearerSession || rawCookieSession;

  if (!rawSession) {
    return NextResponse.json({
      authenticated: false
    });
  }

  const session = decryptSession(rawSession);

  if (!isSessionValid(session)) {
    return NextResponse.json({
      authenticated: false
    });
  }

  return NextResponse.json({
    authenticated: true,
    user: session?.user,
    scope: session?.scope
  });
}