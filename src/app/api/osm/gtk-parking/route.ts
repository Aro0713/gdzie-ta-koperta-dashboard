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

const OVERPASS_URL =
  process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter";

function buildGtkOverpassQuery() {
  return `
[out:json][timeout:25];
area["ISO3166-1"="PL"][admin_level="2"]->.searchArea;
(
  node["amenity"="parking_space"]["parking_space"="disabled"]["survey:tool"~"GdzieTaKoperta|GTK",i](area.searchArea);
  node["amenity"="parking_space"]["parking_space"="disabled"]["source:app"~"GdzieTaKoperta|GTK",i](area.searchArea);
  node["amenity"="parking_space"]["parking_space"="disabled"]["source:application"~"GdzieTaKoperta|GTK",i](area.searchArea);
  node["amenity"="parking_space"]["parking_space"="disabled"]["created_by"~"GdzieTaKoperta|GTK",i](area.searchArea);
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

function toFeature(
  element: Required<Pick<OverpassElement, "id" | "lat" | "lon">> &
    OverpassElement
): Feature<Point, OsmParkingProperties> {
  const tags = element.tags || {};

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [element.lon, element.lat]
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

export async function GET() {
  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
      },
      body: new URLSearchParams({
        data: buildGtkOverpassQuery()
      }),
      cache: "no-store"
    });

    const text = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Overpass API error ${response.status}`,
          details: text.slice(0, 1200)
        },
        {
          status: 502
        }
      );
    }

    const data = JSON.parse(text) as OverpassResponse;

    const uniqueNodes = new Map<number, OverpassElement>();

    for (const element of data.elements || []) {
      if (isValidOverpassNode(element)) {
        uniqueNodes.set(element.id!, element);
      }
    }

    const features = Array.from(uniqueNodes.values()).map((element) =>
      toFeature(
        element as Required<Pick<OverpassElement, "id" | "lat" | "lon">> &
          OverpassElement
      )
    );

    const payload: FeatureCollection<Point, OsmParkingProperties> & {
      metadata: {
        source: string;
        sourceStatus: string;
        mode: string;
        country: string;
        count: number;
        osmBaseTimestamp: string | null;
      };
    } = {
      type: "FeatureCollection",
      metadata: {
        source: "OpenStreetMap live data via Overpass API",
        sourceStatus: "osm_live_overpass",
        mode: "country_gtk_live",
        country: "Poland",
        count: features.length,
        osmBaseTimestamp: data.osm3s?.timestamp_osm_base || null
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

    return NextResponse.json(
      {
        error: "Failed to load live GTK spots from OpenStreetMap",
        details: message
      },
      {
        status: 502
      }
    );
  }
}