import { apiUrl } from "./api";

export type ParkingFeatureProperties = {
  source?: string;
  sourceStatus?: string;
  objectType?: string;
  osmType?: string;
  osmId?: number | string | null;
  osmUrl?: string | null;
  name?: string | null;
  parkingSpace?: string | null;
  capacityDisabled?: string | null;
  distanceMeters?: number | null;
  tags?: Record<string, string>;
};

export type ParkingFeature = {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: number[];
  };
  properties?: ParkingFeatureProperties;
};

export type ParkingResponse = {
  type: "FeatureCollection";
  metadata?: {
    source?: string;
    sourceStatus?: string;
    mode?: string;
    count?: number;
    radiusMeters?: number;
    exactDisabledParkingSpaces?: number;
    parkingsWithDisabledCapacity?: number;
  };
  features: ParkingFeature[];
  error?: string;
};

export async function fetchNearbyParking(params: {
  lat: number;
  lng: number;
  radius?: number;
}) {
  const query = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    radius: String(params.radius ?? 5000)
  });

  const response = await fetch(apiUrl(`/api/osm/parking?${query.toString()}`));
  const data = (await response.json()) as ParkingResponse;

  if (!response.ok || data.error) {
    throw new Error(data.error || "Nie udało się pobrać kopert.");
  }

  return data;
}

export function getParkingFeatureTitle(feature: ParkingFeature) {
  const properties = feature.properties || {};

  if (properties.objectType === "disabled_parking_space") {
    return "Koperta OzN";
  }

  if (properties.objectType === "parking_with_disabled_capacity") {
    return "Parking z miejscami OzN";
  }

  return "Miejsce parkingowe";
}

export function formatDistanceMeters(value?: number | null) {
  if (!Number.isFinite(Number(value))) {
    return "brak dystansu";
  }

  const meters = Number(value);

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
  }

  return `${Math.round(meters)} m`;
}
