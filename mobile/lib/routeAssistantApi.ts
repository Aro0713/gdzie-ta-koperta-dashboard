import { apiUrl } from "./api";
import type { ParkingFeature } from "./parkingApi";

export type RouteSummary = {
  distanceMeters: number | null;
  durationSeconds: number | null;
  distanceLabel: string;
  durationLabel: string;
};

export type RouteAssistantDestination = {
  name: string;
  lat: number;
  lng: number;
  matchedQuery?: string;
};

export type LocalSpotInput = {
  id: string;
  lat: number;
  lng: number;
  status: string;
  osmUrl?: string | null;
  osmNodeId?: string | null;
  addedByName?: string | null;
};

export type RouteAssistantResponse = {
  ok: boolean;
  error?: string;
  query?: string;
  destination?: RouteAssistantDestination;
  recommendedSpot?: ParkingFeature | null;
  spotDistanceToDestinationMeters?: number | null;
  spotDistanceToDestinationLabel?: string;
  alternatives?: ParkingFeature[];
  routeCoordinates?: unknown[];
  routeSummary?: RouteSummary;
  routeToSpotCoordinates?: unknown[];
  routeToSpotSummary?: RouteSummary | null;
  routeToDestinationCoordinates?: unknown[];
  routeToDestinationSummary?: RouteSummary;
  answer?: string;
  sourceCounts?: {
    osm?: number;
    gtkRegistry?: number;
    local?: number;
    merged?: number;
  };
};

export async function fetchRouteAssistant(params: {
  query: string;
  userLat: number;
  userLng: number;
  localSpots?: LocalSpotInput[];
}) {
  const response = await fetch(apiUrl("/api/route-assistant"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: params.query,
      userLat: params.userLat,
      userLng: params.userLng,
      localSpots: params.localSpots || []
    })
  });

  const data = (await response.json()) as RouteAssistantResponse;

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Nie udało się wyznaczyć trasy.");
  }

  return data;
}