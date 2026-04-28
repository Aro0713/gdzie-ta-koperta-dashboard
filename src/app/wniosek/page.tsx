import Link from "next/link";
import { Header } from "@/components/Header";

export default function WniosekPage() {
  return (
    <main className="page-shell">
      <Header />

      <section className="subpage-hero">
        <p className="eyebrow">moduł obywatelski</p>
        <h1>Wniosek do urzędu</h1>
        <p>
          Docelowo aplikacja wygeneruje gotowy wniosek z lokalizacją, zdjęciami
          i opisem problemu. Ten ekran jest makietą procesu.
        </p>
      </section>

      <section className="form-grid">
        <form className="panel form-panel">
          <label>
            Rodzaj sprawy
            <select defaultValue="new_spot">
              <option value="new_spot">Wniosek o wyznaczenie koperty</option>
              <option value="repair_marking">Odnowienie oznakowania</option>
              <option value="remove_obstacle">Usunięcie bariery / przeszkody</option>
              <option value="illegal_parking">Zgłoszenie nadużycia</option>
            </select>
          </label>

          <label>
            Właściwy urząd / jednostka
            <input placeholder="np. Zarząd Dróg Miejskich, urząd miasta, straż miejska" />
          </label>

          <label>
            Lokalizacja sprawy
            <input placeholder="adres + GPS z mapy" />
          </label>

          <label>
            Uzasadnienie
            <textarea placeholder="Krótko: co jest problemem i dlaczego wpływa na dostępność." />
          </label>

          <div className="form-actions">
            <button className="primary-button" type="button">
              Wygeneruj PDF demo
            </button>
            <button className="ghost-button" type="button">
              Wyślij demo
            </button>
          </div>
        </form>

        <aside className="panel preview-panel">
          <p className="eyebrow">podgląd</p>
          <h2>Automatyczny komplet dowodowy</h2>

          <div className="evidence-card">
            <strong>Załączniki</strong>
            <span>zdjęcie miejsca · pinezka GPS · data · status · opis</span>
          </div>

          <div className="evidence-card">
            <strong>Format</strong>
            <span>PDF + e-mail / ePUAP / lokalny kanał urzędu</span>
          </div>

          <div className="evidence-card">
            <strong>Śledzenie</strong>
            <span>złożone · w toku · odpowiedź · zamknięte</span>
          </div>

          <Link className="text-link" href="/mapa">
            Wróć do mapy
          </Link>
        </aside>
      </section>
    </main>
  );
}
