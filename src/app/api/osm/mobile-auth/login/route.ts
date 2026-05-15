import { NextRequest, NextResponse } from "next/server";
import {
  OSM_STATE_COOKIE,
  getCookieOptions,
  getOsmConfig,
  isAllowedMobileReturnTo,
  makeMobileOauthState
} from "@/lib/osmOAuth";

export async function GET(request: NextRequest) {
  const config = getOsmConfig();
  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo") || "gdzietakoperta://osm-auth";

  if (!isAllowedMobileReturnTo(returnTo)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid mobile return URL."
      },
      {
        status: 400
      }
    );
  }

  const state = makeMobileOauthState(returnTo);
  const authorizeUrl = new URL("/oauth2/authorize", config.baseUrl);

  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizeUrl.searchParams.set("scope", "openid read_prefs write_api");
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);

  response.cookies.set(
    OSM_STATE_COOKIE,
    state,
    getCookieOptions(60 * 10)
  );

  return response;
}