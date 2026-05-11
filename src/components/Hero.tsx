import Link from "next/link";
import { appConfig } from "@/lib/appConfig";

export function Hero() {
  return (
    <section className="hero-card">
      <div className="hero-copy">
        <p className="eyebrow">projekt społeczny · open maps · dostępność</p>
        <h1>Gdzie ta koperta?</h1>
        <p className="hero-lead">
          Aplikacja mapowa, która pomaga osobom z niepełnosprawnościami
          znaleźć realnie dostępne miejsca parkingowe i uzupełniać dane
          bezpośrednio przez OpenStreetMap.
        </p>
        <p className="mission-line">{appConfig.mission}</p>

        <div className="hero-actions">
          <Link href="/mapa" className="primary-button">
          Nawigacja
        </Link>
        </div>
      </div>

      <div
        className="hero-photo"
        role="img"
        aria-label="Miejsce parkingowe dla osób z niepełnosprawnościami"
      />
    </section>
  );
}
