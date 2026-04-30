import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

class OverpassRequestError extends Error {
  status: number;
  details: string;

  constructor(status: number, details: string) {
    super("Overpass API request failed");
    this.status = status;
    this.details = details;
  }
}

const OVERPASS_API_URL =
  process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter";

const OVERPASS_USER_AGENT =
  process.env.OVERPASS_USER_AGENT ||
  "GdzieTaKoperta/0.1 (https://gdzietakoperta.pl)";

const OVERPASS_REFERER =
  process.env.OVERPASS_REFERER || "https://gdzietakoperta.pl/";

function parseCoordinate(value: string | null, name: string) {
  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${name}`);
  }

  return parsed;
}

function clampRadius(value: string | null) {
  const parsed = value ? Number(value) : 5000;

  if (!Number.isFinite(parsed)) {
    return 5000;
  }

  return Math.min(Math.max(Math.round(parsed), 100), 5000);
}

function isValidLatLng(lat: number, lng: number) {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function haversineMeters(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
) {
  const earthRadius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;

  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return Math.round(
    earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

function getElementPosition(element: OverpassElement) {
  if (typeof element.lat === "number" && typeof element.lon === "number") {
    return {
      lat: element.lat,
      lng: element.lon
    };
  }

  if (
    element.center &&
    typeof element.center.lat === "number" &&
    typeof element.center.lon === "number"
  ) {
    return {
      lat: element.center.lat,
      lng: element.center.lon
    };
  }

  return null;
}

function getObjectType(tags: Record<string, string>) {
  if (
    tags.amenity === "parking_space" &&
    tags.parking_space === "disabled"
  ) {
    return "disabled_parking_space";
  }

  if (
    tags.amenity === "parking" &&
    typeof tags["capacity:disabled"] === "string"
  ) {
    return "parking_with_disabled_capacity";
  }

  return "parking_related";
}

function toGeoJsonFeature(
  element: OverpassElement,
  userLat: number,
  userLng: number
) {
  const position = getElementPosition(element);

  if (!position) {
    return null;
  }

  const tags = element.tags || {};
  const objectType = getObjectType(tags);

  return {
    type: "Feature" as const,
    properties: {
      source: "openstreetmap",
      sourceStatus: "osm_unverified",
      objectType,
      osmType: element.type,
      osmId: element.id,
      osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      name: tags.name || null,
      amenity: tags.amenity || null,
      parking: tags.parking || null,
      parkingSpace: tags.parking_space || null,
      capacity: tags.capacity || null,
      capacityDisabled: tags["capacity:disabled"] || null,
      access: tags.access || null,
      wheelchair: tags.wheelchair || null,
      surface: tags.surface || null,
      operator: tags.operator || null,
      distanceMeters: haversineMeters(
        userLat,
        userLng,
        position.lat,
        position.lng
      ),
      tags
    },
    geometry: {
      type: "Point" as const,
      coordinates: [position.lng, position.lat]
    }
  };
}

function buildOverpassQuery(lat: number, lng: number, radius: number) {
  return `
[out:json][timeout:25];
(
  nwr(around:${radius},${lat},${lng})["amenity"="parking"]["capacity:disabled"]["capacity:disabled"!="0"]["capacity:disabled"!="no"];
  nwr(around:${radius},${lat},${lng})["amenity"="parking_space"]["parking_space"="disabled"];
);
out center tags qt;
`;
}

async function fetchOverpass(query: string) {
  const attempts = [
    {
      label: "plain-text",
      body: query,
      contentType: "text/plain; charset=UTF-8"
    },
    {
      label: "form-data",
      body: new URLSearchParams({ data: query }),
      contentType: "application/x-www-form-urlencoded"
    }
  ];

  let lastError: OverpassRequestError | null = null;

  for (const attempt of attempts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(OVERPASS_API_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": attempt.contentType,
          "User-Agent": OVERPASS_USER_AGENT,
          Referer: OVERPASS_REFERER
        },
        body: attempt.body,
        signal: controller.signal
      });

      const text = await response.text();

      if (!response.ok) {
        lastError = new OverpassRequestError(
          response.status,
          `[${attempt.label}] ${text.slice(0, 1200)}`
        );
        continue;
      }

      return JSON.parse(text) as OverpassResponse;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown Overpass error";

      lastError = new OverpassRequestError(
        502,
        `[${attempt.label}] ${message}`
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw (
    lastError ||
    new OverpassRequestError(502, "Overpass request failed without details")
  );
}

function jsonError(message: string, status = 400) {
  return NextResponse.json(
    {
      error: message
    },
    {
      status
    }
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  try {
    const lat = parseCoordinate(searchParams.get("lat"), "lat");
    const lng = parseCoordinate(searchParams.get("lng"), "lng");
    const radius = clampRadius(searchParams.get("radius"));

    if (!isValidLatLng(lat, lng)) {
      return jsonError("Invalid latitude or longitude range", 400);
    }

    const query = buildOverpassQuery(lat, lng, radius);
    const overpassData = await fetchOverpass(query);

    const features = (overpassData.elements || [])
      .map((element) => toGeoJsonFeature(element, lat, lng))
      .filter((feature) => feature !== null)
      .sort((a, b) => {
        const first = a.properties.distanceMeters;
        const second = b.properties.distanceMeters;

        return first - second;
      });

    return NextResponse.json(
      {
        type: "FeatureCollection",
        metadata: {
          source: "OpenStreetMap via Overpass API",
          sourceStatus: "unverified_osm_data",
          center: {
            lat,
            lng
          },
          radiusMeters: radius,
          count: features.length,
          queryTypes: [
            "amenity=parking + capacity:disabled",
            "amenity=parking_space + parking_space=disabled"
          ]
        },
        features
      },
      {
        headers: {
          "Cache-Control": "s-maxage=900, stale-while-revalidate=3600"
        }
      }
    );
  } catch (error) {
    if (error instanceof OverpassRequestError) {
      return NextResponse.json(
        {
          error: error.message,
          status: error.status,
          details: error.details
        },
        {
          status: 502
        }
      );
    }

    const message =
      error instanceof Error ? error.message : "Unknown endpoint error";

    return jsonError(message, 400);
  }
}

