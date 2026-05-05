"use client";

import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { KopertyMap } from "@/components/KopertyMap";
import {
  formatMeters,
  formatObjectType,
  getOsmTitle,
  type OsmParkingResponse
} from "@/lib/osmParking";

type MapMode = "near-user" | "gtk-country";

export default function MapaPage() {
  const [osmData, setOsmData] = useState<OsmParkingResponse | null>(null);
  const [mapMode, setMapMode] = useState<MapMode | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("widok");

    setMapMode(requestedView === "gtk-kraj" ? "gtk-country" : "near-user");
  }, []);

  const isGtkCountryView = mapMode === "gtk-country";

  const visibleFeatures = useMemo(() => {
    const features = [...(osmData?.features || [])];

    if (isGtkCountryView) {
      return features
        .sort((a, b) => {
          const firstId = String(a.properties?.osmId || "");
          const secondId = String(b.properties?.osmId || "");

          return firstId.localeCompare(secondId);
        })
        .slice(0, 24);
    }

    return features
      .sort((a, b) => {
        const first = a.properties?.distanceMeters ?? Number.MAX_SAFE_INTEGER;
        const second = b.properties?.distanceMeters ?? Number.MAX_SAFE_INTEGER;

        return first - second;
      })
      .slice(0, 12);
  }, [osmData, isGtkCountryView]);

  const totalCount = osmData?.metadata?.count ?? osmData?.features.length ?? 0;

  return (
    <main className="page-shell">
      <Header />

      <section className="subpage-hero">
        <p className="eyebrow">
          {isGtkCountryView ? "pełny widok GTK" : "pełny widok"}
        </p>

        <h1>{isGtkCountryView ? "Koperty GTK w Polsce" : "Mapa kopert"}</h1>

        <p>
          {isGtkCountryView
            ? "Mapa pokazuje koperty dodane przez użytkowników GTK do OpenStreetMap. Widok obejmuje całą Polskę i nie jest ograniczony promieniem 5 km."
            : "Mapa pokazuje istniejące dane z OpenStreetMap w promieniu wybranym przez użytkownika. Dodawanie nowych kopert odbywa się bezpośrednio na mapie, z konta OpenStreetMap."}
        </p>
      </section>

      <section className="dashboard-grid dashboard-grid-map">
        <div className="panel panel-large">
          {mapMode ? (
            <KopertyMap full mode={mapMode} onOsmData={setOsmData} />
          ) : (
            <div className="empty-state-card">
              <strong>Ładuję mapę</strong>
              <span>Sprawdzam, który widok mapy uruchomić.</span>
            </div>
          )}
        </div>

        <aside className="panel osm-sidebar">
          <div className="panel-header">
            <div>
              <p className="eyebrow">
                {isGtkCountryView ? "koperty GTK" : "punkty OSM"}
              </p>
              <h2>
                {isGtkCountryView
                  ? "Dodane przez GTK"
                  : "Najbliższe miejsca"}
              </h2>
            </div>

            <span className="map-status-pill">{totalCount}</span>
          </div>

          {!osmData ? (
            <div className="empty-state-card">
              <strong>
                {isGtkCountryView
                  ? "Pobieram koperty GTK"
                  : "Czekam na lokalizację"}
              </strong>
              <span>
                {isGtkCountryView
                  ? "Pobieram z OpenStreetMap koperty oznaczone jako dodane przez GdzieTaKoperta."
                  : "Po zgodzie przeglądarki pokażę najbliższe koperty i parkingi oznaczone w OpenStreetMap."}
              </span>
            </div>
          ) : visibleFeatures.length === 0 ? (
            <div className="empty-state-card">
              <strong>
                {isGtkCountryView
                  ? "Brak kopert GTK w OSM"
                  : "Brak punktów w OSM"}
              </strong>
              <span>
                {isGtkCountryView
                  ? "Overpass nie zwrócił jeszcze kopert oznaczonych tagiem GTK. Świeże edycje mogą pojawić się po krótkiej synchronizacji."
                  : "To nie musi oznaczać braku kopert w okolicy. Może oznaczać, że nikt jeszcze nie naniósł ich do OSM."}
              </span>
            </div>
          ) : (
            <div className="osm-side-list">
              {visibleFeatures.map((feature, index) => {
                const properties = feature.properties || {};
                const key = `${properties.osmType || "feature"}-${
                  properties.osmId || index
                }`;

                return (
                  <article className="osm-side-card" key={key}>
                    <div className="osm-side-card-top">
                      <div>
                        <h3>{getOsmTitle(properties)}</h3>
                        <p>{formatObjectType(properties.objectType)}</p>
                      </div>

                      <span>
                        {isGtkCountryView
                          ? "GTK"
                          : formatMeters(properties.distanceMeters)}
                      </span>
                    </div>

                    <div className="osm-side-meta">
                      {isGtkCountryView ? (
                        <span>OSM ID: {properties.osmId || "brak danych"}</span>
                      ) : (
                        <span>
                          OzN: {properties.capacityDisabled || "brak danych"}
                        </span>
                      )}

                      <span>
                        nawierzchnia: {properties.surface || "brak danych"}
                      </span>

                      <span>
                        dostęp: {properties.access || "brak danych"}
                      </span>
                    </div>

                    <div className="osm-side-actions">
                      {properties.osmUrl ? (
                        <a
                          href={properties.osmUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-link"
                        >
                          Zobacz w OSM
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}