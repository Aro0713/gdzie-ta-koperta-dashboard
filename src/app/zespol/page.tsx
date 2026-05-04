import Link from "next/link";
import { Header } from "@/components/Header";

const team = [
  {
    initials: "ŁK",
    name: "Łukasz Kwaśny",
    role: "Autor pomysłu projektu społecznego",
    description:
      "Pomysłodawca projektu „Gdzie ta Koperta?” — inicjatywy, która ma realnie ułatwić osobom z niepełnosprawnościami odnajdywanie miejsc parkingowych i uzupełnianie brakujących danych w przestrzeni miejskiej.",
    accent: "idea"
  },
  {
    initials: "AŁ",
    name: "Arkadiusz Łabuda",
    role: "Twórca aplikacji i strony",
    description:
      "Odpowiada za budowę aplikacji, architekturę strony www.gdzietakoperta.pl, wdrożenie na Vercel oraz rozwój narzędzi pozwalających użytkownikom dodawać koperty przez OpenStreetMap.",
    accent: "build"
  },
  {
    initials: "MM",
    name: "Marcin Mytych",
    role: "Wsparcie informatyczne i dane OpenStreetMap",
    description:
      "Informatyk wspierający powstanie aplikacji w oparciu o dane OpenStreetMap, podejście OSM-first, automatyzację pobierania danych oraz integrację społecznościowego mapowania.",
    accent: "data"
  }
];

export default function ZespolPage() {
  return (
    <main className="page-shell">
      <Header />

      <section className="team-hero">
        <div className="team-hero-copy">
          <p className="eyebrow">zespół projektu</p>
          <h1>Ludzie za „Gdzie ta Koperta?”</h1>
          <p>
            Projekt powstaje z połączenia doświadczenia społecznego, pracy
            technologicznej i wiedzy o otwartych danych mapowych. Celem nie jest
            kolejna mapa dla samej mapy — celem jest praktyczna dostępność.
          </p>
        </div>
          <div
            className="team-hero-panel team-hero-panel-photo"
            role="img"
            aria-label="Miejsce parkingowe dla osób z niepełnosprawnościami"
          >
            <div className="team-hero-panel-overlay" />

            <div className="team-hero-panel-bg-text" aria-hidden="true">
              MISJA
            </div>

            <div className="team-hero-panel-content team-hero-panel-content-centered">
              <span>
                Dostępność nie może być teorią. Musi być dla ludzi, musi być realna
                i musi działać wtedy, kiedy ktoś naprawdę jej potrzebuje.
              </span>
            </div>
          </div>
      </section>

      <section className="team-grid" aria-label="Zespół projektu">
        {team.map((person) => (
          <article className={`team-card team-card-${person.accent}`} key={person.name}>
            <div className="team-avatar" aria-hidden="true">
              {person.initials}
            </div>

            <div className="team-card-body">
              <p className="eyebrow">{person.role}</p>
              <h2>{person.name}</h2>
              <p>{person.description}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="team-footer-panel">
        <div>
          <p className="eyebrow">model działania</p>
          <h2>OSM-first, społecznie i bezpłatnie dla użytkowników</h2>
          <p>
            „Gdzie ta Koperta?” rozwijamy tak, aby osoby z niepełnosprawnościami
            mogły korzystać z aplikacji bez opłat, a dane o kopertach były
            oparte o otwarty ekosystem OpenStreetMap.
          </p>
        </div>

        <Link className="primary-button" href="/mapa">
          Otwórz mapę
        </Link>
      </section>
    </main>
  );
}
