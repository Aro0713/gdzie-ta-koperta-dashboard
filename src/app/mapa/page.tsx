"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { KopertyMap } from "@/components/KopertyMap";
import {
  formatMeters,
  formatObjectType,
  getOsmTitle,
  type OsmParkingResponse
} from "@/lib/osmParking";

export default function MapaPage() {
  const [osmData, setOsmData] = useState<OsmParkingResponse | null>(null);

  const nearestFeatures = useMemo(() => {
    return [...(osmData?.features || [])]
      .sort((a, b) => {
        const first = a.properties?.distanceMeters ?? Number.MAX_SAFE_INTEGER;
        const second = b.properties?.distanceMeters ?? Number.MAX_SAFE_INTEGER;

        return first - second;
      })
      .slice(0, 12);
  }, [osmData]);

  const totalCount = osmData?.metadata?.count ?? osmData?.features.length ?? 0;

  return (
    <main className="page-shell">
      <Header />

      <section className="subpage-hero">
        <p className="eyebrow">pełny widok</p>
        <h1>Mapa kopert</h1>
        <p>
          Mapa pokazuje istniejące dane z OpenStreetMap w promieniu 5 km od
          lokalizacji urządzenia. Te punkty wymagają społecznego potwierdzania,
          bo OSM pokazuje dane mapowe, a nie gwarancję aktualnej dostępności.
        </p>
        <Link className="primary-button" href="/zglos">
          Zgłoś nową kopertę
        </Link>
      </section>

      <section className="dashboard-grid dashboard-grid-map">
        <div className="panel panel-large">
          <KopertyMap full onOsmData={setOsmData} />
        </div>

        <aside className="panel osm-sidebar">
          <div className="panel-header">
            <div>
              <p className="eyebrow">punkty OSM</p>
              <h2>Najbliższe miejsca</h2>
            </div>
            <span className="map-status-pill">{totalCount}</span>
          </div>

          {!osmData ? (
            <div className="empty-state-card">
              <strong>Czekam na lokalizację</strong>
              <span>
                Po zgodzie przeglądarki pokażę najbliższe koperty i parkingi
                oznaczone w OpenStreetMap.
              </span>
            </div>
          ) : nearestFeatures.length === 0 ? (
            <div className="empty-state-card">
              <strong>Brak punktów w OSM</strong>
              <span>
                To nie musi oznaczać braku kopert w okolicy. Może oznaczać, że
                nikt jeszcze nie naniósł ich do OSM.
              </span>
            </div>
          ) : (
            <div className="osm-side-list">
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

                    <div className="osm-side-meta">
                      <span>
                        OzN: {properties.capacityDisabled || "brak danych"}
                      </span>
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
                          OSM
                        </a>
                      ) : null}

                      <button type="button" className="mini-button">
                        Potwierdź
                      </button>
                      <button type="button" className="mini-button">
                        Problem
                      </button>
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
