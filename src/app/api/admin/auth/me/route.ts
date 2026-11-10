import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionFromRequest } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getAdminSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      username: session.username,
      authMethod: session.authMethod,
      osmUserId: session.osmUserId || null,
      hasOsmToken: Boolean(session.osmAccessToken),
      expiresAt: session.expiresAt,
    },
  });
}
