import type { Feature, FeatureCollection, Point } from "geojson";

export type OsmParkingProperties = {
  source?: string;
  sourceStatus?: string;
  objectType?: string;
  osmType?: string;
  osmId?: number;
  osmUrl?: string;
  name?: string | null;
  amenity?: string | null;
  parking?: string | null;
  parkingSpace?: string | null;
  capacity?: string | null;
  capacityDisabled?: string | null;
  access?: string | null;
  wheelchair?: string | null;
  surface?: string | null;
  operator?: string | null;
  distanceMeters?: number;
  tags?: Record<string, string>;
};

export type OsmParkingFeature = Feature<Point, OsmParkingProperties>;

export type OsmParkingResponse = FeatureCollection<Point, OsmParkingProperties> & {
  metadata?: {
    count?: number;
    radiusMeters?: number;
    center?: {
      lat: number;
      lng: number;
    };
  };
  error?: string;
  details?: string;
};

export function formatMeters(value?: number) {
  if (typeof value !== "number") {
    return "brak danych";
  }

  if (value < 1000) {
    return `${value} m`;
  }

  return `${(value / 1000).toFixed(1).replace(".", ",")} km`;
}

export function formatObjectType(type?: string) {
  if (type === "disabled_parking_space") {
    return "Pojedyncza koperta OSM";
  }

  if (type === "parking_with_disabled_capacity") {
    return "Parking z miejscami dla OzN";
  }

  return "Obiekt parkingowy OSM";
}

export function getOsmTitle(properties: OsmParkingProperties) {
  if (properties.name) {
    return properties.name;
  }

  if (properties.objectType === "disabled_parking_space") {
    return "Koperta z OpenStreetMap";
  }

  if (properties.objectType === "parking_with_disabled_capacity") {
    return "Parking z miejscami dla OzN";
  }

  return "Obiekt z OpenStreetMap";
}

export function escapeHtml(value: unknown) {
  const chars: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  };

  return String(value ?? "").replace(/[&<>"']/g, (char) => chars[char] || char);
}
