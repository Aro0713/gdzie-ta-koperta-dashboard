import Link from "next/link";
import { Header } from "@/components/Header";
import { appConfig } from "@/lib/appConfig";

export default function PolitykaCookiesPage() {
  return (
    <main className="page-shell">
      <Header />

      <section className="subpage-hero">
        <p className="eyebrow">informacje prawne</p>
        <h1>Polityka cookies</h1>
        <p>
          Ta polityka wyjaśnia, jak serwis {appConfig.name} korzysta z plików
          cookies, pamięci lokalnej przeglądarki oraz podobnych technologii.
        </p>
      </section>

      <section className="panel legal-panel">
        <div className="legal-content">
          <p>
            <strong>Data ostatniej aktualizacji:</strong> 5 maja 2026 r.
          </p>

          <h2>1. Czym są pliki cookies?</h2>
          <p>
            Pliki cookies to niewielkie pliki tekstowe zapisywane na urządzeniu
            użytkownika przez przeglądarkę internetową. Mogą być używane między
            innymi do utrzymania sesji, zapamiętania ustawień użytkownika,
            zapewnienia bezpieczeństwa albo prowadzenia statystyk działania
            serwisu.
          </p>

          <h2>2. Jakich technologii używa serwis?</h2>
          <p>
            Serwis {appConfig.name} może korzystać z następujących technologii:
          </p>

          <ul>
            <li>
              <strong>Cookies techniczne i sesyjne</strong> — używane do
              prawidłowego działania serwisu, w tym obsługi logowania przez
              OpenStreetMap.
            </li>
            <li>
              <strong>localStorage</strong> — pamięć lokalna przeglądarki
              wykorzystywana do przechowywania lokalnych szkiców kopert oraz
              danych roboczych użytkownika przed albo po wysłaniu ich do
              OpenStreetMap.
            </li>
            <li>
              <strong>Analityka techniczna</strong> — jeżeli jest włączona,
              może służyć do podstawowego pomiaru działania serwisu, np. liczby
              odwiedzin, błędów albo wydajności strony.
            </li>
          </ul>

          <h2>3. Cookies niezbędne</h2>
          <p>
            Cookies niezbędne są potrzebne do działania funkcji, o które
            użytkownik sam prosi, na przykład logowania, obsługi sesji albo
            zabezpieczenia komunikacji. Bez nich część funkcji serwisu może nie
            działać prawidłowo.
          </p>

          <h2>4. Logowanie przez OpenStreetMap</h2>
          <p>
            Jeżeli użytkownik loguje się przez OpenStreetMap, serwis może
            zapisać techniczny cookie sesyjny potrzebny do utrzymania
            uwierzytelnienia. Cookie ten służy do rozpoznania, że użytkownik
            jest zalogowany i może wysłać edycję do OpenStreetMap.
          </p>

          <p>
            Samo wysłanie koperty do OpenStreetMap oznacza utworzenie albo
            edycję danych w OpenStreetMap zgodnie z zasadami tej platformy.
            Dane opublikowane w OpenStreetMap mogą być publicznie widoczne.
          </p>

          <h2>5. Dane zapisywane lokalnie w przeglądarce</h2>
          <p>
            Serwis może zapisywać lokalnie w przeglądarce szkice kopert dodane
            przez użytkownika na mapie. Takie dane mogą obejmować między innymi:
            współrzędne GPS, datę dodania, status szkicu, liczbę potwierdzeń
            oraz identyfikator obiektu OSM po wysłaniu.
          </p>

          <p>
            Dane zapisane lokalnie są przechowywane na urządzeniu użytkownika i
            mogą zostać usunięte przez wyczyszczenie danych strony w
            przeglądarce albo przez funkcje dostępne w aplikacji, jeżeli są
            udostępnione.
          </p>

          <h2>6. Analityka</h2>
          <p>
            Jeżeli w serwisie włączona jest analityka, może ona służyć do
            pomiaru działania strony i poprawiania jej użyteczności. Jeżeli
            analityka wymaga zgody użytkownika, powinna być uruchamiana dopiero
            po jej wyrażeniu.
          </p>

          <h2>7. Zarządzanie cookies</h2>
          <p>
            Użytkownik może zarządzać cookies w ustawieniach swojej
            przeglądarki. Może je blokować, usuwać albo ustawić przeglądarkę
            tak, aby informowała o próbach ich zapisania.
          </p>

          <p>
            Zablokowanie cookies technicznych może spowodować, że niektóre
            funkcje serwisu, na przykład logowanie przez OpenStreetMap albo
            wysyłanie kopert do OSM, nie będą działać prawidłowo.
          </p>

          <h2>8. Zgoda i jej wycofanie</h2>
          <p>
            Cookies niezbędne do działania usługi mogą być używane bez osobnej
            zgody, jeżeli są konieczne do dostarczenia funkcji wyraźnie
            żądanej przez użytkownika. Cookies analityczne, marketingowe albo
            śledzące mogą wymagać wcześniejszej zgody użytkownika.
          </p>

          <p>
            Jeżeli serwis wdroży mechanizm zgody na cookies, użytkownik
            powinien mieć możliwość jej wycofania równie łatwo, jak jej
            udzielenia.
          </p>

          <h2>9. Zmiany polityki cookies</h2>
          <p>
            Polityka cookies może być aktualizowana wraz z rozwojem serwisu,
            zmianami technologicznymi albo zmianami wymogów prawnych. Aktualna
            wersja dokumentu jest publikowana na tej stronie.
          </p>

          <h2>10. Kontakt</h2>
          <p>
            W sprawach dotyczących działania serwisu i tej polityki można
            kontaktować się przez oficjalny profil projektu.
          </p>

          <p>
            <a
              className="text-link"
              href="https://www.facebook.com/profile.php?id=61582500564569"
              target="_blank"
              rel="noreferrer"
            >
              Facebook Gdzie ta Koperta
            </a>
          </p>

          <div className="legal-actions">
            <Link href="/" className="ghost-button">
              Wróć na stronę główną
            </Link>
            <Link href="/mapa" className="primary-button">
              Przejdź do mapy
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}