"use client";

import { useMemo, useState } from "react";
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

export default function MapaPage() {
  const [osmData, setOsmData] = useState<OsmParkingResponse | null>(null);
  const [assistantQuery, setAssistantQuery] = useState("");
  const [assistantResult, setAssistantResult] =
    useState<RouteAssistantResponse | null>(null);
  const [routeOverlay, setRouteOverlay] = useState<RouteMapOverlay | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);

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
        maximumAge: 60000
      });
    });
  }

  async function submitRouteAssistant() {
    const query = assistantQuery.trim();

    if (!query) {
      setAssistantError("Wpisz cel podróży.");
      return;
    }

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
        recommendedSpot: data.recommendedSpot || null
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