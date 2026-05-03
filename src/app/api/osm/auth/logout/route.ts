import { NextRequest, NextResponse } from "next/server";
import { OSM_SESSION_COOKIE } from "@/lib/osmOAuth";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url));

  response.cookies.delete(OSM_SESSION_COOKIE);

  return response;
}
