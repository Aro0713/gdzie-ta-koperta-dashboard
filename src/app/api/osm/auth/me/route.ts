import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  OSM_SESSION_COOKIE,
  decryptSession,
  isSessionValid
} from "@/lib/osmOAuth";

export async function GET() {
  const cookieStore = await cookies();
  const rawSession = cookieStore.get(OSM_SESSION_COOKIE)?.value;

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
