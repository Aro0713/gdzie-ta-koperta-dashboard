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

async function geocodeDestination(query: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");

  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
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

  const places = (await response.json()) as NominatimPlace[];

  if (!Array.isArray(places) || places.length === 0) {
    return null;
  }

  const place = places[0];
  const lat = Number(place.lat);
  const lng = Number(place.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isValidLatLng(lat, lng)) {
    return null;
  }

  return {
    name: place.display_name,
    lat,
    lng
  };
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

  const data = (await response.json()) as Partial<OsmParkingResponse>;

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
    return jsonError("Podaj cel podróży.", 400);
  }

  if (!Number.isFinite(userLat) || !Number.isFinite(userLng) || !isValidLatLng(userLat, userLng)) {
    return jsonError("Brak poprawnej lokalizacji startowej użytkownika.", 400);
  }

  try {
    const destination = await geocodeDestination(query);

    if (!destination) {
      return jsonError("Nie znalazłem takiego celu podróży.", 404);
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