import { NextRequest, NextResponse } from "next/server";
import type { OsmParkingFeature, OsmParkingResponse } from "@/lib/osmParking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteAssistantBody = {
  query?: string;
  userLat?: number;
  userLng?: number;
};

type NominatimPlace = {
  display_name: string;
  lat: string;
  lon: string;
  importance?: number;
  class?: string;
  type?: string;
};

type OrsFeatureCollection = {
  type: "FeatureCollection";
  bbox?: number[];
  features: Array<{
    type: "Feature";
    properties?: {
      summary?: {
        distance?: number;
        duration?: number;
      };
      segments?: Array<{
        distance?: number;
        duration?: number;
      }>;
    };
    geometry: {
      type: "LineString";
      coordinates: number[][];
    };
  }>;
  metadata?: unknown;
};

type OsmParkingApiResponse = Partial<OsmParkingResponse> & {
  error?: string;
};

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      details
    },
    {
      status
    }
  );
}

function jsonAppError(message: string, details?: unknown) {
  return NextResponse.json({
    ok: false,
    error: message,
    details
  });
}

function isValidLatLng(lat: number, lng: number) {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function formatMeters(value?: number | null) {
  if (!Number.isFinite(Number(value))) {
    return "brak danych";
  }

  const meters = Number(value);

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
  }

  return `${Math.round(meters)} m`;
}

function formatDuration(seconds?: number | null) {
  if (!Number.isFinite(Number(seconds))) {
    return "brak danych";
  }

  const minutes = Math.round(Number(seconds) / 60);

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest > 0 ? `${hours} godz. ${rest} min` : `${hours} godz.`;
}

function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePolishCityCase(value: string) {
  const city = normalizeText(value);
  const normalized = city.toLowerCase();

  const cityMap: Record<string, string> = {
    "sosnowcu": "Sosnowiec",
    "katowicach": "Katowice",
    "warszawie": "Warszawa",
    "krakowie": "Kraków",
    "wrocławiu": "Wrocław",
    "poznaniu": "Poznań",
    "gdańsku": "Gdańsk",
    "łodzi": "Łódź",
    "będzinie": "Będzin",
    "dąbrowie górniczej": "Dąbrowa Górnicza",
    "chorzowie": "Chorzów",
    "gliwicach": "Gliwice",
    "zabrzu": "Zabrze",
    "tysiącach": "Tychy",
    "tychach": "Tychy"
  };

  return cityMap[normalized] || city;
}

function stripGenericPlaceWords(value: string) {
  return normalizeText(
    value
      .replace(/\b(basen|pływalnia|plywalnia|aquapark|obiekt|miejsce)\b/giu, " ")
      .replace(/\b(przy|koło|kolo|obok)\b/giu, " ")
  );
}

function normalizeStreetPrefix(value: string) {
  return normalizeText(
    value
      .replace(/\bul\.?\s+/giu, "ulica ")
      .replace(/\baleja\b/giu, "Aleja")
      .replace(/\bal\.?\s+/giu, "Aleja ")
  );
}

function removeStreetPrefix(value: string) {
  return normalizeText(
    value
      .replace(/\bulica\s+/giu, "")
      .replace(/\bul\.?\s+/giu, "")
      .replace(/\bAleja\s+/giu, "")
      .replace(/\bal\.?\s+/giu, "")
  );
}

function uniqueQueries(queries: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const query of queries) {
    const clean = normalizeText(query);

    if (!clean || clean.length < 3) {
      continue;
    }

    const key = clean.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(clean);
  }

  return result;
}

function buildGeocodeQueries(rawQuery: string) {
  const query = normalizeText(rawQuery);
  const withStreetPrefix = normalizeStreetPrefix(query);
  const withoutGeneric = stripGenericPlaceWords(withStreetPrefix);

  const queries: string[] = [
    query,
    `${query}, Polska`,
    withStreetPrefix,
    `${withStreetPrefix}, Polska`,
    withoutGeneric,
    `${withoutGeneric}, Polska`
  ];

  const lower = withStreetPrefix.toLowerCase();
  const citySeparatorIndex = lower.lastIndexOf(" w ");

  if (citySeparatorIndex > -1) {
    const beforeCity = normalizeText(withStreetPrefix.slice(0, citySeparatorIndex));
    const rawCity = normalizeText(withStreetPrefix.slice(citySeparatorIndex + 3));
    const city = normalizePolishCityCase(rawCity);

    const beforeWithoutGeneric = stripGenericPlaceWords(beforeCity);
    const beforeWithoutStreetPrefix = removeStreetPrefix(beforeWithoutGeneric);

    queries.push(
      `${beforeCity}, ${city}, Polska`,
      `${beforeWithoutGeneric}, ${city}, Polska`,
      `${beforeWithoutStreetPrefix}, ${city}, Polska`
    );
  }

  return uniqueQueries(queries);
}

function getSpotPriority(feature: OsmParkingFeature) {
  const objectType = feature.properties?.objectType;

  if (objectType === "disabled_parking_space") {
    return 0;
  }

  if (objectType === "parking_with_disabled_capacity") {
    return 1;
  }

  return 2;
}

function pickBestSpot(data: OsmParkingResponse) {
  const features = data.features || [];

  if (features.length === 0) {
    return null;
  }

  return [...features].sort((a, b) => {
    const priorityA = getSpotPriority(a);
    const priorityB = getSpotPriority(b);

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    const distanceA = a.properties?.distanceMeters ?? Number.MAX_SAFE_INTEGER;
    const distanceB = b.properties?.distanceMeters ?? Number.MAX_SAFE_INTEGER;

    return distanceA - distanceB;
  })[0];
}

function getSpotLatLng(feature: OsmParkingFeature) {
  const [lng, lat] = feature.geometry.coordinates;

  return {
    lat,
    lng
  };
}

async function searchNominatim(query: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");

  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "pl");
  url.searchParams.set("q", query);

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "GdzieTaKoperta/1.0 contact:www.gdzietakoperta.pl",
      Referer: "https://www.gdzietakoperta.pl"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Nominatim returned ${response.status}`);
  }

  return (await response.json()) as NominatimPlace[];
}

function pickBestNominatimPlace(places: NominatimPlace[]) {
  const validPlaces = places
    .map((place) => {
      const lat = Number(place.lat);
      const lng = Number(place.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isValidLatLng(lat, lng)) {
        return null;
      }

      return {
        place,
        lat,
        lng
      };
    })
    .filter(
      (
        item
      ): item is {
        place: NominatimPlace;
        lat: number;
        lng: number;
      } => Boolean(item)
    );

  if (validPlaces.length === 0) {
    return null;
  }

  return validPlaces.sort((a, b) => {
    const firstImportance = Number(a.place.importance || 0);
    const secondImportance = Number(b.place.importance || 0);

    return secondImportance - firstImportance;
  })[0];
}

async function geocodeDestination(query: string) {
  const queries = buildGeocodeQueries(query);

  for (const candidateQuery of queries) {
    const places = await searchNominatim(candidateQuery);
    const selected = pickBestNominatimPlace(places);

    if (!selected) {
      continue;
    }

    return {
      name: selected.place.display_name,
      lat: selected.lat,
      lng: selected.lng,
      matchedQuery: candidateQuery
    };
  }

  return null;
}

async function getRoute(params: {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}) {
  const apiKey = process.env.OPENROUTE_API_KEY;

  if (!apiKey) {
    throw new Error("Missing OPENROUTE_API_KEY");
  }

  const url = new URL("https://api.openrouteservice.org/v2/directions/driving-car");

  url.searchParams.set("start", `${params.startLng},${params.startLat}`);
  url.searchParams.set("end", `${params.endLng},${params.endLat}`);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: apiKey
    },
    cache: "no-store"
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`OpenRouteService returned ${response.status}: ${text.slice(0, 1000)}`);
  }

  return JSON.parse(text) as OrsFeatureCollection;
}

async function getOsmParkingNearDestination(origin: string, lat: number, lng: number) {
  const url = new URL("/api/osm/parking", origin);

  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lng));
  url.searchParams.set("radius", "5000");

  const response = await fetch(url.toString(), {
    cache: "no-store"
  });

  const data = (await response.json()) as OsmParkingApiResponse;

  if (!response.ok || data.error) {
    throw new Error(data.error || "Nie udało się pobrać kopert OSM przy celu.");
  }

  return data as OsmParkingResponse;
}

export async function POST(request: NextRequest) {
  let body: RouteAssistantBody;

  try {
    body = (await request.json()) as RouteAssistantBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const query = String(body.query || "").trim();
  const userLat = Number(body.userLat);
  const userLng = Number(body.userLng);

  if (!query) {
    return jsonAppError("Podaj cel podróży.");
  }

  if (!Number.isFinite(userLat) || !Number.isFinite(userLng) || !isValidLatLng(userLat, userLng)) {
    return jsonAppError("Brak poprawnej lokalizacji startowej użytkownika.");
  }

  try {
    const destination = await geocodeDestination(query);

    if (!destination) {
      return jsonAppError(
        "Nie znalazłem takiego celu podróży. Spróbuj wpisać ulicę i miasto, np. „Żeromskiego, Sosnowiec”.",
        {
          triedQueries: buildGeocodeQueries(query)
        }
      );
    }

    const parkingData = await getOsmParkingNearDestination(
      request.nextUrl.origin,
      destination.lat,
      destination.lng
    );

    const recommendedSpot = pickBestSpot(parkingData);

    const routeTarget = recommendedSpot
      ? getSpotLatLng(recommendedSpot)
      : {
          lat: destination.lat,
          lng: destination.lng
        };

    const route = await getRoute({
      startLat: userLat,
      startLng: userLng,
      endLat: routeTarget.lat,
      endLng: routeTarget.lng
    });

    const routeSummary = route.features[0]?.properties?.summary || null;
    const spotDistanceToDestination =
      recommendedSpot?.properties?.distanceMeters ?? null;

    const recommendedType =
      recommendedSpot?.properties?.objectType === "disabled_parking_space"
        ? "Dokładna koperta z OpenStreetMap"
        : recommendedSpot?.properties?.objectType === "parking_with_disabled_capacity"
          ? "Parking z informacją o miejscach dla OzN"
          : "Brak rekomendowanej koperty";

    const answer = recommendedSpot
      ? `Znalazłem miejsce postoju przy celu. ${recommendedType}. Odległość od celu: ${formatMeters(
          spotDistanceToDestination
        )}. Dojazd samochodem: ${formatDuration(routeSummary?.duration)}.`
      : `Nie znalazłem oznaczonej koperty przy celu w promieniu 5 km. Pokazuję trasę bezpośrednio do celu. Dojazd samochodem: ${formatDuration(
          routeSummary?.duration
        )}.`;

    return NextResponse.json({
      ok: true,
      query,
      destination,
      recommendedSpot,
      alternatives: (parkingData.features || [])
        .filter((feature) => {
          if (!recommendedSpot) {
            return true;
          }

          return feature.properties?.osmId !== recommendedSpot.properties?.osmId;
        })
        .slice(0, 5),
      route,
      routeSummary: {
        distanceMeters: routeSummary?.distance ?? null,
        durationSeconds: routeSummary?.duration ?? null,
        distanceLabel: formatMeters(routeSummary?.distance),
        durationLabel: formatDuration(routeSummary?.duration)
      },
      answer
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Nieznany błąd asystenta dojazdu.";

    return jsonError("Nie udało się wyznaczyć trasy i miejsca postoju.", 502, {
      message
    });
  }
}