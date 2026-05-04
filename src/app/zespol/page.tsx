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

        <div className="team-hero-panel">
          <strong>Misja</strong>
          <span>
            Dostępność ma działać w codziennym życiu: na parkingu, przy urzędzie,
            przy przychodni, pod domem i wszędzie tam, gdzie brak jednej
            „koperty” potrafi zablokować komuś normalne funkcjonowanie.
          </span>
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
