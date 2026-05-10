"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { KopertyMap, type RouteMapOverlay } from "@/components/KopertyMap";
import {
  formatMeters,
  formatObjectType,
  getOsmTitle,
  type OsmParkingFeature,
  type OsmParkingResponse
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

function routeCoordinatesToLatLngs(route?: RouteMapOverlay["route"]) {
  const coordinates = route?.features?.[0]?.geometry?.coordinates;

  if (!Array.isArray(coordinates)) {
    return [];
  }

  return coordinates
    .map((coordinate) => {
      const lng = Number(coordinate[0]);
      const lat = Number(coordinate[1]);

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
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
  route?: RouteMapOverlay["route"]
) {
  const points = routeCoordinatesToLatLngs(route);

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

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    lat,
    lng
  };
}

export default function MapaPage() {
  const [osmData, setOsmData] = useState<OsmParkingResponse | null>(null);
  const [assistantQuery, setAssistantQuery] = useState("");
  const [assistantResult, setAssistantResult] =
    useState<RouteAssistantResponse | null>(null);
  const [routeOverlay, setRouteOverlay] = useState<RouteMapOverlay | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
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

  const nearestFeatures = useMemo(() => {
    return [...(osmData?.features || [])]
      .sort((a, b) => {
        const first = a.properties?.distanceMeters ?? Number.MAX_SAFE_INTEGER;
        const second = b.properties?.distanceMeters ?? Number.MAX_SAFE_INTEGER;

        return first - second;
      })
      .slice(0, 6);
  }, [osmData]);

  const totalCount = osmData?.metadata?.count ?? osmData?.features.length ?? 0;

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
      assistantResult.route
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

    if (assistantResult) {
      setRouteOverlay({
        route: assistantResult.route || null,
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
    <main className="page-shell">
      <Header />

      <section className="subpage-hero">
        <p className="eyebrow">pełny widok</p>
        <h1>Mapa kopert</h1>
        <p>
          Mapa pokazuje istniejące dane z OpenStreetMap w promieniu wybranym
          przez użytkownika. Dodawanie nowych kopert odbywa się bezpośrednio
          na mapie, z konta OpenStreetMap.
        </p>
      </section>

      <section className="dashboard-grid dashboard-grid-map">
        <div className="panel panel-large">
          <KopertyMap
            full
            routeOverlay={routeOverlay}
            onOsmData={setOsmData}
          />
        </div>

        <aside className="panel osm-sidebar route-assistant-sidebar">
          <div className="panel-header">
            <div>
              <p className="eyebrow">asystent dojazdu</p>
              <h2>Dokąd jedziesz?</h2>
              <p className="dashboard-map-note">
                Wpisz cel podróży. Wskażę najbliższą kopertę lub parking dla
                OzN i policzę trasę dojazdu.
              </p>
            </div>
          </div>

          <form
            className="route-assistant-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitRouteAssistant();
            }}
          >
            <label>
              Cel podróży
              <input
                value={assistantQuery}
                onChange={(event) => setAssistantQuery(event.target.value)}
                placeholder="np. Spodek Katowice"
                type="text"
              />
            </label>

            <button
              type="submit"
              className="primary-button route-assistant-submit"
              disabled={assistantLoading}
            >
              {assistantLoading ? "Szukam…" : "Pokaż trasę"}
            </button>
          </form>

          {assistantError ? (
            <div className="route-assistant-error">{assistantError}</div>
          ) : null}

          {assistantResult ? (
            <div className="route-assistant-result">
              <strong>Rekomendacja</strong>

              <p>{assistantResult.answer}</p>

              {assistantResult.destination ? (
                <div className="route-assistant-block">
                  <span>Cel</span>
                  <strong>{assistantResult.destination.name}</strong>
                </div>
              ) : null}

              {assistantResult.routeSummary ? (
                <div className="route-assistant-meta">
                  <span>
                    Trasa: {assistantResult.routeSummary.distanceLabel}
                  </span>
                  <span>
                    Czas: {assistantResult.routeSummary.durationLabel}
                  </span>
                </div>
              ) : null}

              <div className="route-navigation-panel">
                <strong>Prowadzenie do koperty</strong>
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
                      className="primary-button route-assistant-submit"
                      onClick={() => void startNavigation()}
                      disabled={!assistantResult.recommendedSpot}
                    >
                      Start dojazdu do koperty
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="mini-button"
                      onClick={stopNavigation}
                    >
                      Stop
                    </button>
                  )}

                  {navigationState.status === "off_route" ? (
                    <button
                      type="button"
                      className="mini-button"
                      onClick={() => void submitRouteAssistant()}
                    >
                      Przelicz trasę
                    </button>
                  ) : null}
                </div>
              </div>

              {recommendedProperties ? (
                <article className="osm-side-card route-assistant-spot-card">
                  <div className="osm-side-card-top">
                    <div>
                      <h3>{getOsmTitle(recommendedProperties)}</h3>
                      <p>{formatObjectType(recommendedProperties.objectType)}</p>
                    </div>

                    <span>
                      {formatMeters(recommendedProperties.distanceMeters)}
                    </span>
                  </div>

                  <div className="osm-side-meta">
                    <span>
                      OzN:{" "}
                      {recommendedProperties.capacityDisabled || "brak danych"}
                    </span>
                    <span>
                      nawierzchnia:{" "}
                      {recommendedProperties.surface || "brak danych"}
                    </span>
                    <span>
                      dostęp: {recommendedProperties.access || "brak danych"}
                    </span>
                  </div>

                  {recommendedProperties.osmUrl ? (
                    <div className="osm-side-actions">
                      <a
                        href={recommendedProperties.osmUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-link"
                      >
                        Zobacz w OSM
                      </a>
                    </div>
                  ) : null}
                </article>
              ) : null}

              {assistantResult.alternatives &&
              assistantResult.alternatives.length > 0 ? (
                <div className="route-assistant-alternatives">
                  <strong>Alternatywy</strong>

                  {assistantResult.alternatives.slice(0, 3).map((feature) => {
                    const properties = feature.properties || {};
                    const key = `${properties.osmType}-${properties.osmId}`;

                    return (
                      <article className="route-assistant-alt" key={key}>
                        <span>{getOsmTitle(properties)}</span>
                        <strong>{formatMeters(properties.distanceMeters)}</strong>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="empty-state-card">
              <strong>Asystent czeka na cel</strong>
              <span>
                Najpierw podaj miejsce, do którego jedziesz. Po zgodzie na
                lokalizację znajdę najbliższe dostępne miejsce postoju.
              </span>
            </div>
          )}

          {!assistantResult && nearestFeatures.length > 0 ? (
            <div className="route-assistant-nearby">
              <div className="panel-header route-assistant-mini-header">
                <div>
                  <p className="eyebrow">punkty OSM</p>
                  <h3>Najbliższe teraz</h3>
                </div>
                <span className="map-status-pill">{totalCount}</span>
              </div>

              <div className="osm-side-list route-assistant-compact-list">
                {nearestFeatures.map((feature) => {
                  const properties = feature.properties || {};
                  const key = `${properties.osmType}-${properties.osmId}`;

                  return (
                    <article className="osm-side-card" key={key}>
                      <div className="osm-side-card-top">
                        <div>
                          <h3>{getOsmTitle(properties)}</h3>
                          <p>{formatObjectType(properties.objectType)}</p>
                        </div>
                        <span>{formatMeters(properties.distanceMeters)}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}