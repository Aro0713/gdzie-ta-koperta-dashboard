import Link from "next/link";
import { Header } from "@/components/Header";
import { KopertyMap } from "@/components/KopertyMap";
import { SpotCard } from "@/components/SpotCard";
import { demoSpots } from "@/lib/demoSpots";

export default function MapaPage() {
  return (
    <main className="page-shell">
      <Header />

      <section className="subpage-hero">
        <p className="eyebrow">pełny widok</p>
        <h1>Mapa kopert</h1>
        <p>
          Widok MVP pod przyszłą integrację z bazą PostGIS, importem OSM/Overpass
          i społeczną weryfikacją danych.
        </p>
        <Link className="primary-button" href="/zglos">
          Zgłoś nową kopertę
        </Link>
      </section>

      <section className="dashboard-grid dashboard-grid-map">
        <div className="panel panel-large">
          <KopertyMap full />
        </div>

        <aside className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">punkty</p>
              <h2>Widoczne miejsca</h2>
            </div>
          </div>

          <div className="spot-list compact-list">
            {demoSpots.map((spot) => (
              <SpotCard key={spot.id} spot={spot} />
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
