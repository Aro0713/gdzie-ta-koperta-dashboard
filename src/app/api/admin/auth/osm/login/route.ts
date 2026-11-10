import { NextResponse } from "next/server";
import {
  OSM_STATE_COOKIE,
  getCookieOptions,
  getOsmConfig,
  makeOauthState,
} from "@/lib/osmOAuth";

export const runtime = "nodejs";

export async function GET() {
  const config = getOsmConfig();
  const state = `admin.${makeOauthState()}`;

  const authorizeUrl = new URL("/oauth2/authorize", config.baseUrl);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizeUrl.searchParams.set("scope", "openid read_prefs write_api");
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  // Zapisujemy oczekiwany stan w ciasteczku
  response.cookies.set(OSM_STATE_COOKIE, state, getCookieOptions(60 * 10));
  response.cookies.set("gtk_admin_oauth_intent", "1", getCookieOptions(60 * 10));

  return response;
}
