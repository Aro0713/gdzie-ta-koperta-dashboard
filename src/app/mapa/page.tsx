"use client";

import { useEffect, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { KopertyMap, type RouteMapOverlay } from "@/components/KopertyMap";
import {
  formatMeters,
  formatObjectType,
  getOsmTitle,
  type OsmParkingFeature
} from "@/lib/osmParking";

type RouteAssistantResponse = {
  ok?: boolean;
  query?: string;
  destination?: {
    name: string;
    lat: number;
    lng: number;
  };
  recommendedSpot?: OsmParkingFeature | null;
  alternatives?: OsmParkingFeature[];
  route?: RouteMapOverlay["route"];
  routeCoordinates?: RouteMapOverlay["routeCoordinates"];
  routeSummary?: {
    distanceMeters: number | null;
    durationSeconds: number | null;
    distanceLabel: string;
    durationLabel: string;
  };
  answer?: string;
  error?: string;
  details?: unknown;
};

type NavigationStatus = "idle" | "on_route" | "off_route" | "arrived";

type NavigationState = {
  active: boolean;
  status: NavigationStatus;
  message: string;
  remainingMeters: number | null;
  distanceToRouteMeters: number | null;
  accuracyMeters: number | null;
};

const OFF_ROUTE_THRESHOLD_METERS = 90;
const ARRIVED_THRESHOLD_METERS = 35;
const EARTH_RADIUS_METERS = 6371000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number }
) {
  const dLat = toRadians(second.lat - first.lat);
  const dLng = toRadians(second.lng - first.lng);
  const lat1 = toRadians(first.lat);
  const lat2 = toRadians(second.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatNavigationDistance(value: number | null) {
  if (!Number.isFinite(Number(value))) {
    return "brak danych";
  }

  const meters = Number(value);

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
  }

  return `${Math.round(meters)} m`;
}

function isValidLatLng(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function routeCoordinatesToLatLngs(
  route?: RouteMapOverlay["route"],
  routeCoordinates?: RouteMapOverlay["routeCoordinates"]
) {
  if (Array.isArray(routeCoordinates) && routeCoordinates.length > 0) {
    return routeCoordinates
      .map((coordinate) => {
        const lat = Number(coordinate.lat);
        const lng = Number(coordinate.lng);

        if (!isValidLatLng(lat, lng)) {
          return null;
        }

        return {
          lat,
          lng
        };
      })
      .filter((point): point is { lat: number; lng: number } => Boolean(point));
  }

  const coordinates = route?.features?.[0]?.geometry?.coordinates;

  if (!Array.isArray(coordinates)) {
    return [];
  }

  return coordinates
    .map((coordinate) => {
      const lng = Number(coordinate[0]);
      const lat = Number(coordinate[1]);

      if (!isValidLatLng(lat, lng)) {
        return null;
      }

      return {
        lat,
        lng
      };
    })
    .filter((point): point is { lat: number; lng: number } => Boolean(point));
}

function projectToMeters(
  point: { lat: number; lng: number },
  origin: { lat: number; lng: number }
) {
  const latRad = toRadians(origin.lat);

  return {
    x:
      toRadians(point.lng - origin.lng) *
      EARTH_RADIUS_METERS *
      Math.cos(latRad),
    y: toRadians(point.lat - origin.lat) * EARTH_RADIUS_METERS
  };
}

function distancePointToSegmentMeters(
  point: { lat: number; lng: number },
  segmentStart: { lat: number; lng: number },
  segmentEnd: { lat: number; lng: number }
) {
  const p = projectToMeters(point, segmentStart);
  const a = {
    x: 0,
    y: 0
  };
  const b = projectToMeters(segmentEnd, segmentStart);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= 0) {
    return distanceMeters(point, segmentStart);
  }

  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)
  );

  const projected = {
    x: a.x + t * dx,
    y: a.y + t * dy
  };

  const distanceX = p.x - projected.x;
  const distanceY = p.y - projected.y;

  return Math.sqrt(distanceX * distanceX + distanceY * distanceY);
}

function distanceToRouteMeters(
  position: { lat: number; lng: number },
  route?: RouteMapOverlay["route"],
  routeCoordinates?: RouteMapOverlay["routeCoordinates"]
) {
  const points = routeCoordinatesToLatLngs(route, routeCoordinates);

  if (points.length < 2) {
    return null;
  }

  let best = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length - 1; index += 1) {
    best = Math.min(
      best,
      distancePointToSegmentMeters(position, points[index], points[index + 1])
    );
  }

  return Number.isFinite(best) ? best : null;
}

function getFeatureLatLng(feature?: OsmParkingFeature | null) {
  const coordinates = feature?.geometry?.coordinates;

  if (!coordinates || coordinates.length < 2) {
    return null;
  }

  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);

  if (!isValidLatLng(lat, lng)) {
    return null;
  }

  return {
    lat,
    lng
  };
}

export default function MapaPage() {
  const [assistantQuery, setAssistantQuery] = useState("");
  const [assistantResult, setAssistantResult] =
    useState<RouteAssistantResponse | null>(null);
  const [routeOverlay, setRouteOverlay] = useState<RouteMapOverlay | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantPanelCollapsed, setAssistantPanelCollapsed] = useState(false);
  const [navigationState, setNavigationState] = useState<NavigationState>({
    active: false,
    status: "idle",
    message: "Nawigacja nie jest uruchomiona.",
    remainingMeters: null,
    distanceToRouteMeters: null,
    accuracyMeters: null
  });

  const navigationWatchId = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (
        typeof navigator !== "undefined" &&
        navigator.geolocation &&
        navigationWatchId.current !== null
      ) {
        navigator.geolocation.clearWatch(navigationWatchId.current);
        navigationWatchId.current = null;
      }
    };
  }, []);

  function getCurrentPosition() {
    return new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Ta przeglądarka nie obsługuje geolokalizacji."));
        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 20000
      });
    });
  }

  function getNavigationTarget(result = assistantResult) {
    const recommendedSpotTarget = getFeatureLatLng(result?.recommendedSpot);

    if (recommendedSpotTarget) {
      return recommendedSpotTarget;
    }

    if (result?.destination) {
      return {
        lat: result.destination.lat,
        lng: result.destination.lng
      };
    }

    return null;
  }

  function updateNavigationFromPosition(position: GeolocationPosition) {
    if (!assistantResult) {
      return;
    }

    const currentPosition = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracyMeters: Number.isFinite(position.coords.accuracy)
        ? position.coords.accuracy
        : null
    };

    const target = getNavigationTarget(assistantResult);
    const remainingMeters = target
      ? distanceMeters(currentPosition, target)
      : null;

    const routeDistanceMeters = distanceToRouteMeters(
      currentPosition,
      assistantResult.route,
      assistantResult.routeCoordinates
    );

    let status: NavigationStatus = "on_route";
    let message = "Prowadzę do rekomendowanego miejsca postoju.";

    if (remainingMeters !== null && remainingMeters <= ARRIVED_THRESHOLD_METERS) {
      status = "arrived";
      message = "Jesteś przy rekomendowanej kopercie.";
    } else if (
      routeDistanceMeters !== null &&
      routeDistanceMeters > OFF_ROUTE_THRESHOLD_METERS
    ) {
      status = "off_route";
      message = "Jesteś poza trasą. Przelicz trasę z aktualnej pozycji.";
    }

    setNavigationState({
      active: true,
      status,
      message,
      remainingMeters,
      distanceToRouteMeters: routeDistanceMeters,
      accuracyMeters: currentPosition.accuracyMeters
    });

    setRouteOverlay({
      route: assistantResult.route || null,
      routeCoordinates: assistantResult.routeCoordinates || null,
      destination: assistantResult.destination || null,
      recommendedSpot: assistantResult.recommendedSpot || null,
      currentPosition,
      routeStatus: status,
      fitMode: "follow"
    });
  }

  function stopNavigation() {
    if (navigator.geolocation && navigationWatchId.current !== null) {
      navigator.geolocation.clearWatch(navigationWatchId.current);
      navigationWatchId.current = null;
    }

    setNavigationState((current) => ({
      ...current,
      active: false,
      status: "idle",
      message: "Nawigacja została zatrzymana."
    }));
    setAssistantPanelCollapsed(false);

    if (assistantResult) {
      setRouteOverlay({
        route: assistantResult.route || null,
        routeCoordinates: assistantResult.routeCoordinates || null,
        destination: assistantResult.destination || null,
        recommendedSpot: assistantResult.recommendedSpot || null,
        fitMode: "route"
      });
    }
  }

  async function startNavigation() {
    if (!assistantResult) {
      setAssistantError("Najpierw wyznacz trasę.");
      return;
    }

    if (!assistantResult.recommendedSpot) {
      setAssistantError("Brak rekomendowanej koperty, do której można prowadzić.");
      return;
    }

    if (!navigator.geolocation) {
      setAssistantError("Ta przeglądarka nie obsługuje geolokalizacji.");
      return;
    }

    if (navigationWatchId.current !== null) {
      navigator.geolocation.clearWatch(navigationWatchId.current);
      navigationWatchId.current = null;
    }

    setAssistantError(null);

    try {
      const firstPosition = await getCurrentPosition();
      updateNavigationFromPosition(firstPosition);
      setAssistantPanelCollapsed(true);

      navigationWatchId.current = navigator.geolocation.watchPosition(
        updateNavigationFromPosition,
        () => {
          setAssistantError(
            "Nie mogę odświeżyć lokalizacji. Sprawdź zgodę przeglądarki."
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 5000
        }
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nie udało się uruchomić nawigacji.";

      setAssistantError(message);
    }
  }

  async function submitRouteAssistant() {
    const query = assistantQuery.trim();

    if (!query) {
      setAssistantError("Wpisz cel podróży.");
      return;
    }

    stopNavigation();
    setAssistantPanelCollapsed(false);

    setAssistantLoading(true);
    setAssistantError(null);
    setAssistantResult(null);
    setRouteOverlay(null);

    try {
      const position = await getCurrentPosition();

      const response = await fetch("/api/route-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query,
          userLat: position.coords.latitude,
          userLng: position.coords.longitude
        })
      });

      const data = (await response.json()) as RouteAssistantResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Nie udało się wyznaczyć trasy.");
      }

      setAssistantResult(data);
      setRouteOverlay({
        route: data.route || null,
        routeCoordinates: data.routeCoordinates || null,
        destination: data.destination || null,
        recommendedSpot: data.recommendedSpot || null,
        fitMode: "route"
      });

      setNavigationState({
        active: false,
        status: "idle",
        message: "Trasa gotowa. Możesz uruchomić prowadzenie do koperty.",
        remainingMeters: null,
        distanceToRouteMeters: null,
        accuracyMeters: null
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nieznany błąd asystenta dojazdu.";

      setAssistantError(message);
      setRouteOverlay(null);
    } finally {
      setAssistantLoading(false);
    }
  }

  const recommendedProperties = assistantResult?.recommendedSpot?.properties;

  return (
    <main className="page-shell page-shell-navigation">
      <Header />

      <section className="navigation-map-section" aria-label="Mapa nawigacji">
        <div className="navigation-map-card">
          <KopertyMap
            full
            routeOverlay={routeOverlay}
            navigationControl={
              navigationState.active
                ? {
                    active: true,
                    remainingLabel: formatNavigationDistance(
                      navigationState.remainingMeters
                    ),
                    statusLabel: navigationState.message,
                    onOpen: () => setAssistantPanelCollapsed(false),
                    onStop: stopNavigation
                  }
                : null
            }
          />

           <div
              className={`route-assistant-mapbar ${
                assistantResult ? "route-assistant-mapbar-expanded" : ""
              } ${assistantPanelCollapsed ? "route-assistant-mapbar-collapsed" : ""}`}
            >
            <form
              className="route-assistant-mapbar-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submitRouteAssistant();
              }}
            >
              <label htmlFor="route-assistant-query">Cel podróży</label>

              <div className="route-assistant-mapbar-row">
                <input
                  id="route-assistant-query"
                  value={assistantQuery}
                  onChange={(event) => setAssistantQuery(event.target.value)}
                  placeholder="Dokąd jedziesz?"
                  type="text"
                />

                <button
                  type="submit"
                  className="route-assistant-mapbar-submit"
                  disabled={assistantLoading}
                >
                  {assistantLoading ? "Szukam…" : "Pokaż"}
                </button>
              </div>
            </form>

            {assistantError ? (
              <div className="route-assistant-mapbar-error">
                {assistantError}
              </div>
            ) : null}

            {assistantResult ? (
              <div className="route-assistant-mapbar-result">
                <div className="route-assistant-mapbar-result-top">
                  <div>
                    <span>Rekomendacja</span>
                    <strong>
                      {assistantResult.recommendedSpot
                        ? "Prowadzenie do koperty"
                        : "Trasa do celu"}
                    </strong>
                  </div>

                  {assistantResult.routeSummary ? (
                    <div className="route-assistant-mapbar-summary">
                      <span>{assistantResult.routeSummary.durationLabel}</span>
                      <strong>{assistantResult.routeSummary.distanceLabel}</strong>
                    </div>
                  ) : null}
                </div>

                {assistantResult.answer ? (
                  <p>{assistantResult.answer}</p>
                ) : null}

                <div className="route-navigation-panel route-navigation-panel-compact">
                  <strong>Prowadzenie</strong>
                  <p>{navigationState.message}</p>

                  <div className="route-assistant-meta">
                    <span>
                      Do koperty:{" "}
                      {formatNavigationDistance(navigationState.remainingMeters)}
                    </span>
                    <span>
                      Od trasy:{" "}
                      {formatNavigationDistance(
                        navigationState.distanceToRouteMeters
                      )}
                    </span>
                  </div>

                  <div className="route-navigation-actions">
                    {!navigationState.active ? (
                      <button
                        type="button"
                        className="route-navigation-primary"
                        onClick={() => void startNavigation()}
                        disabled={!assistantResult.recommendedSpot}
                      >
                        Nawiguj
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="route-navigation-secondary"
                        onClick={stopNavigation}
                      >
                        Stop
                      </button>
                    )}

                    {navigationState.status === "off_route" ? (
                      <button
                        type="button"
                        className="route-navigation-secondary"
                        onClick={() => void submitRouteAssistant()}
                      >
                        Przelicz
                      </button>
                    ) : null}
                  </div>
                </div>

                {recommendedProperties ? (
                  <article className="route-assistant-mapbar-spot">
                    <div>
                      <span>Rekomendowane miejsce</span>
                      <strong>{getOsmTitle(recommendedProperties)}</strong>
                      <small>
                        {formatObjectType(recommendedProperties.objectType)}
                      </small>
                    </div>

                    <div className="route-assistant-mapbar-spot-meta">
                      <span>{formatMeters(recommendedProperties.distanceMeters)}</span>
                      <span>
                        nawierzchnia:{" "}
                        {recommendedProperties.surface || "brak danych"}
                      </span>
                      <span>
                        dostęp: {recommendedProperties.access || "brak danych"}
                      </span>
                    </div>

                    {recommendedProperties.osmUrl ? (
                      <a
                        href={recommendedProperties.osmUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        OSM
                      </a>
                    ) : null}
                  </article>
                ) : null}
              </div>
            ) : null}

            <div
              className="route-assistant-attribution route-assistant-attribution-mapbar"
              aria-label="Atrybucja routingu i danych mapowych"
            >
              <span>
                Trasy:{" "}
                <a
                  href="https://openrouteservice.org/"
                  target="_blank"
                  rel="noreferrer"
                >
                  © openrouteservice.org by HeiGIT
                </a>
              </span>
              <span>
                Dane mapy:{" "}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                >
                  © OpenStreetMap contributors
                </a>
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}