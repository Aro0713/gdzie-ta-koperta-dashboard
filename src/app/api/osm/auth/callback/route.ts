import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  OSM_SESSION_COOKIE,
  OSM_STATE_COOKIE,
  encryptSession,
  getCookieOptions,
  getOsmConfig,
  type OsmSession
} from "@/lib/osmOAuth";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type OsmUserDetailsResponse = {
  user?: {
    id?: number;
    display_name?: string;
    account_created?: string;
  };
};

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function GET(request: NextRequest) {
  const config = getOsmConfig();
  const { searchParams } = new URL(request.url);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return redirectTo(request, `/mapa?osm=error&reason=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return redirectTo(request, "/mapa?osm=missing_code");
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OSM_STATE_COOKIE)?.value;

  if (!expectedState || expectedState !== state) {
    return redirectTo(request, "/mapa?osm=invalid_state");
  }

  const tokenResponse = await fetch(`${config.baseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri
    })
  });

  const tokenData = (await tokenResponse.json()) as TokenResponse;

  if (!tokenResponse.ok || !tokenData.access_token) {
    const reason =
      tokenData.error_description ||
      tokenData.error ||
      "token_exchange_failed";

    return redirectTo(
      request,
      `/mapa?osm=token_error&reason=${encodeURIComponent(reason)}`
    );
  }

  const userResponse = await fetch(`${config.apiBaseUrl}/user/details.json`, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/json"
    }
  });

  if (!userResponse.ok) {
    return redirectTo(request, "/mapa?osm=user_details_error");
  }

  const userData = (await userResponse.json()) as OsmUserDetailsResponse;
  const expiresIn = tokenData.expires_in || 60 * 60 * 24 * 7;

  const session: OsmSession = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000,
    scope: tokenData.scope,
    user: {
      id: userData.user?.id,
      displayName: userData.user?.display_name,
      accountCreated: userData.user?.account_created
    }
  };

  const response = redirectTo(request, "/mapa?osm=connected");

  response.cookies.set(
    OSM_SESSION_COOKIE,
    encryptSession(session),
    getCookieOptions(Math.min(expiresIn, 60 * 60 * 24 * 30))
  );

  response.cookies.delete(OSM_STATE_COOKIE);

  return response;
}
