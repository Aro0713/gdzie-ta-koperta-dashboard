import Link from "next/link";
import { Header } from "@/components/Header";

export default function ZglosPage() {
  return (
    <main className="page-shell">
      <Header />

      <section className="subpage-hero">
        <p className="eyebrow">formularz MVP</p>
        <h1>Zgłoś kopertę</h1>
        <p>
          Ten ekran jest przygotowany jako UI. W kolejnym kroku podepniemy zapis
          do Supabase, zdjęcia i geolokalizację.
        </p>
      </section>

      <section className="form-grid">
        <form className="panel form-panel">
          <label>
            Nazwa / opis miejsca
            <input placeholder="np. Koperta przy wejściu do przychodni" />
          </label>

          <label>
            Adres albo lokalizacja
            <input placeholder="ulica, miasto albo współrzędne GPS" />
          </label>

          <label>
            Liczba miejsc
            <input type="number" min="1" placeholder="1" />
          </label>

          <label>
            Status
            <select defaultValue="confirmed">
              <option value="confirmed">Istnieje i jest oznaczona</option>
              <option value="needs_verification">Do sprawdzenia</option>
              <option value="reported_problem">Problem z oznakowaniem</option>
            </select>
          </label>

          <label>
            Opis problemu / uwagi
            <textarea placeholder="np. brak znaku pionowego, starta farba, zastawione miejsce" />
          </label>

          <div className="form-actions">
            <button className="primary-button" type="button">
              Zapisz zgłoszenie demo
            </button>
            <Link className="ghost-button" href="/wniosek">
              Przejdź do wniosku
            </Link>
          </div>
        </form>

        <aside className="panel callout-panel">
          <p className="eyebrow">ważne</p>
          <h2>Minimum danych, maksimum użyteczności</h2>
          <p>
            Użytkownik powinien móc dodać punkt w kilkanaście sekund. GPS,
            zdjęcie i krótki status są ważniejsze niż formularz z piekła urzędu.
          </p>
          <ul className="next-list">
            <li>Położenie GPS i korekta pinezki.</li>
            <li>Zdjęcie oznakowania poziomego/pionowego.</li>
            <li>Status: istnieje, brak oznaczenia, zajęta, usunięta.</li>
            <li>Automatyczne wykrywanie duplikatów w promieniu 20 m.</li>
          </ul>
        </aside>
      </section>
    </main>
  );
}
