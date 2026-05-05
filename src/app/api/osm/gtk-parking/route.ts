import { NextResponse } from "next/server";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { OsmParkingProperties } from "@/lib/osmParking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OverpassElement = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
  osm3s?: {
    timestamp_osm_base?: string;
    copyright?: string;
  };
};

const OVERPASS_ENDPOINTS = [
  process.env.OVERPASS_API_URL,
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter"
].filter(Boolean) as string[];

/**
 * BBox Polski z lekkim marginesem:
 * south, west, north, east
 */
const POLAND_BBOX = "49.0,14.0,55.2,24.5";

function buildGtkOverpassQuery() {
  return `
[out:json][timeout:25];
(
  node["amenity"="parking_space"]["parking_space"="disabled"]["survey:tool"="GdzieTaKoperta"](${POLAND_BBOX});
  node["amenity"="parking_space"]["parking_space"="disabled"]["source:app"="GdzieTaKoperta"](${POLAND_BBOX});
  node["amenity"="parking_space"]["parking_space"="disabled"]["source:application"="GdzieTaKoperta"](${POLAND_BBOX});
  node["amenity"="parking_space"]["parking_space"="disabled"]["created_by"="GdzieTaKoperta"](${POLAND_BBOX});
);
out body;
`;
}

function isValidOverpassNode(element: OverpassElement) {
  return (
    element.type === "node" &&
    typeof element.id === "number" &&
    typeof element.lat === "number" &&
    typeof element.lon === "number" &&
    element.lat >= -90 &&
    element.lat <= 90 &&
    element.lon >= -180 &&
    element.lon <= 180
  );
}

function toFeature(element: OverpassElement): Feature<Point, OsmParkingProperties> {
  const tags = element.tags || {};

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [element.lon as number, element.lat as number]
    },
    properties: {
      source: "openstreetmap",
      sourceStatus: "osm_live_overpass",
      objectType: "disabled_parking_space",
      osmType: "node",
      osmId: element.id,
      osmUrl: `https://www.openstreetmap.org/node/${element.id}`,
      name: tags.name || null,
      amenity: tags.amenity || null,
      parkingSpace: tags.parking_space || null,
      access: tags.access || null,
      wheelchair: tags.wheelchair || null,
      surface: tags.surface || null,
      tags
    }
  };
}

async function fetchOverpass(endpoint: string) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "*/*",
      "User-Agent": "GdzieTaKoperta/1.0 contact:www.gdzietakoperta.pl"
    },
    body: new URLSearchParams({
      data: buildGtkOverpassQuery()
    }),
    cache: "no-store"
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Overpass ${endpoint} returned ${response.status}: ${text.slice(0, 1200)}`
    );
  }

  try {
    return JSON.parse(text) as OverpassResponse;
  } catch {
    throw new Error(
      `Overpass ${endpoint} returned non-JSON response: ${text.slice(0, 1200)}`
    );
  }
}

export async function GET() {
  const errors: string[] = [];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const data = await fetchOverpass(endpoint);

      const uniqueNodes = new Map<number, OverpassElement>();

      for (const element of data.elements || []) {
        if (isValidOverpassNode(element)) {
          uniqueNodes.set(element.id as number, element);
        }
      }

      const features = Array.from(uniqueNodes.values()).map(toFeature);

      const payload: FeatureCollection<Point, OsmParkingProperties> & {
        metadata: {
          source: string;
          sourceStatus: string;
          mode: string;
          country: string;
          count: number;
          osmBaseTimestamp: string | null;
          overpassEndpoint: string;
        };
      } = {
        type: "FeatureCollection",
        metadata: {
          source: "OpenStreetMap live data via Overpass API",
          sourceStatus: "osm_live_overpass",
          mode: "country_gtk_live",
          country: "Poland",
          count: features.length,
          osmBaseTimestamp: data.osm3s?.timestamp_osm_base || null,
          overpassEndpoint: endpoint
        },
        features
      };

      return NextResponse.json(payload, {
        headers: {
          "Cache-Control": "s-maxage=20, stale-while-revalidate=60"
        }
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown Overpass error";

      errors.push(message);

      console.error("[api/osm/gtk-parking] Overpass endpoint failed", {
        endpoint,
        message
      });
    }
  }

  return NextResponse.json(
    {
      error: "Failed to load live GTK spots from OpenStreetMap",
      details: errors
    },
    {
      status: 502
    }
  );
}