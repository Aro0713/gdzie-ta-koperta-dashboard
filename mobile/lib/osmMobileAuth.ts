import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { apiUrl } from "./api";

WebBrowser.maybeCompleteAuthSession();

const OSM_MOBILE_SESSION_KEY = "gtk_osm_mobile_session";

export type OsmMobileUser = {
  id?: number;
  displayName?: string;
  accountCreated?: string;
};

export type OsmMeResponse = {
  authenticated: boolean;
  user?: OsmMobileUser;
  scope?: string;
};

export type SubmitDisabledParkingResponse = {
  ok: boolean;
  error?: string;
  localSpotId?: string | null;
  nodeId?: string;
  changesetId?: string;
  osmUrl?: string;
  registrySaved?: boolean;
  registryError?: string | null;
  message?: string;
};

function getStringParam(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}

export async function getStoredOsmSession() {
  return SecureStore.getItemAsync(OSM_MOBILE_SESSION_KEY);
}

export async function clearStoredOsmSession() {
  await SecureStore.deleteItemAsync(OSM_MOBILE_SESSION_KEY);
}

export async function getOsmMe() {
  const session = await getStoredOsmSession();

  if (!session) {
    return {
      authenticated: false
    } satisfies OsmMeResponse;
  }

  const response = await fetch(apiUrl("/api/osm/auth/me"), {
    headers: {
      Authorization: `Bearer ${session}`
    }
  });

  const data = (await response.json()) as OsmMeResponse;

  if (!response.ok || !data.authenticated) {
    await clearStoredOsmSession();

    return {
      authenticated: false
    };
  }

  return data;
}

export async function loginWithOsm() {
  const returnTo = Linking.createURL("osm-auth");
  const loginUrl = apiUrl(
    `/api/osm/mobile-auth/login?returnTo=${encodeURIComponent(returnTo)}`
  );

  const result = await WebBrowser.openAuthSessionAsync(loginUrl, returnTo);

  if (result.type !== "success" || !result.url) {
    throw new Error("Logowanie OSM nie zostało zakończone.");
  }

  const parsed = Linking.parse(result.url);
  const error = getStringParam(parsed.queryParams?.reason);
  const session = getStringParam(parsed.queryParams?.session);

  if (error) {
    throw new Error(`Błąd logowania OSM: ${error}`);
  }

  if (!session) {
    throw new Error("Brak sesji OSM po logowaniu.");
  }

  await SecureStore.setItemAsync(OSM_MOBILE_SESSION_KEY, session);

  return getOsmMe();
}

export async function submitDisabledParkingSpace(params: {
  lat: number;
  lng: number;
  localSpotId: string;
}) {
  const session = await getStoredOsmSession();

  if (!session) {
    throw new Error("Najpierw zaloguj się do OpenStreetMap.");
  }

  const response = await fetch(apiUrl("/api/osm/edit/disabled-parking-space"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      lat: params.lat,
      lng: params.lng,
      localSpotId: params.localSpotId,
      source: "mobile_app"
    })
  });

  const data = (await response.json()) as SubmitDisabledParkingResponse;

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Nie udało się wysłać koperty do OSM.");
  }

  return data;
}