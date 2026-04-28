import Link from "next/link";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { KopertyMap } from "@/components/KopertyMap";
import { SpotCard } from "@/components/SpotCard";
import { StatsCards } from "@/components/StatsCards";
import { demoSpots } from "@/lib/demoSpots";

const nextSteps = [
  "Supabase + PostGIS jako źródło prawdziwych punktów.",
  "Import danych OSM/Overpass raz dziennie.",
  "Zgłoszenia do urzędu: zdjęcie, GPS, opis, PDF.",
  "Społeczna weryfikacja: istnieje / nie istnieje / problem."
];

export default function Home() {
  return (
    <main className="page-shell">
      <Header />
      <Hero />
      <StatsCards />

      <section className="dashboard-grid">
        <div className="panel panel-large">
          <div className="panel-header">
            <div>
              <p className="eyebrow">mapa</p>
              <h2>Najbliższe koperty</h2>
            </div>
            <Link href="/mapa" className="text-link">
              Pełny widok
            </Link>
          </div>
          <KopertyMap />
        </div>

        <aside className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">workflow</p>
              <h2>Co robi aplikacja?</h2>
            </div>
          </div>

          <div className="workflow-list">
            <div>
              <strong>1. Znajdź</strong>
              <span>najbliższą potwierdzoną kopertę.</span>
            </div>
            <div>
              <strong>2. Zgłoś</strong>
              <span>nowe miejsce, brak oznaczenia albo problem.</span>
            </div>
            <div>
              <strong>3. Zweryfikuj</strong>
              <span>czy dane są aktualne i przydatne dla innych.</span>
            </div>
            <div>
              <strong>4. Wyślij wniosek</strong>
              <span>do właściwego urzędu, z lokalizacją i zdjęciami.</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">lista</p>
              <h2>Ostatnie punkty</h2>
            </div>
          </div>

          <div className="spot-list">
            {demoSpots.map((spot) => (
              <SpotCard key={spot.id} spot={spot} />
            ))}
          </div>
        </div>

        <div className="panel callout-panel">
          <p className="eyebrow">kolejne kroki</p>
          <h2>Z MVP do realnej aplikacji</h2>
          <ul className="next-list">
            {nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>

          <div className="hero-actions compact-actions">
            <Link className="primary-button" href="/wniosek">
              Moduł wniosku
            </Link>
            <Link className="ghost-button" href="/zglos">
              Dodawanie koperty
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
