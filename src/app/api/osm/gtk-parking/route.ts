import { NextRequest, NextResponse } from "next/server";
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

type QueryMode = "features" | "ids";

const OVERPASS_ENDPOINTS = [
  process.env.OVERPASS_API_URL,
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
].filter(Boolean) as string[];

/**
 * BBox Polski z lekkim marginesem:
 * south, west, north, east
 */
const POLAND_BBOX = "49.0,14.0,55.2,24.5";

function getQueryMode(request: NextRequest): QueryMode {
  const { searchParams } = new URL(request.url);
  return searchParams.get("mode") === "ids" ? "ids" : "features";
}

function buildGtkOverpassQuery(mode: QueryMode) {
  const timeout = mode === "ids" ? 10 : 20;
  const output = mode === "ids" ? "ids" : "body";

  return `
[out:json][timeout:${timeout}];
node["survey:tool"="GdzieTaKoperta"]["amenity"="parking_space"]["parking_space"="disabled"](${POLAND_BBOX});
out ${output};
`;
}

function getUniqueNodeIds(data: OverpassResponse) {
  const ids = new Set<number>();

  for (const element of data.elements || []) {
    if (element.type === "node" && typeof element.id === "number") {
      ids.add(element.id);
    }
  }

  return Array.from(ids).sort((a, b) => a - b);
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

async function fetchOverpass(endpoint: string, mode: QueryMode) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "*/*",
      "User-Agent": "GdzieTaKoperta/1.0 contact:www.gdzietakoperta.pl"
    },
    body: new URLSearchParams({
      data: buildGtkOverpassQuery(mode)
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

export async function GET(request: NextRequest) {
  const mode = getQueryMode(request);
  const errors: string[] = [];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const data = await fetchOverpass(endpoint, mode);
      const osmNodeIds = getUniqueNodeIds(data);

      if (mode === "ids") {
        return NextResponse.json(
          {
            type: "FeatureCollection",
            metadata: {
              source: "OpenStreetMap live data via Overpass API",
              sourceStatus: "osm_live_overpass",
              mode: "country_gtk_live_ids",
              country: "Poland",
              count: osmNodeIds.length,
              osmBaseTimestamp: data.osm3s?.timestamp_osm_base || null,
              overpassEndpoint: endpoint
            },
            osmNodeIds,
            features: []
          },
          {
            headers: {
              "Cache-Control": "s-maxage=20, stale-while-revalidate=60"
            }
          }
        );
      }

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
        osmNodeIds: number[];
      } = {
        type: "FeatureCollection",
        metadata: {
          source: "OpenStreetMap live data via Overpass API",
          sourceStatus: "osm_live_overpass",
          mode: "country_gtk_live_features",
          country: "Poland",
          count: features.length,
          osmBaseTimestamp: data.osm3s?.timestamp_osm_base || null,
          overpassEndpoint: endpoint
        },
        osmNodeIds,
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
        mode,
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