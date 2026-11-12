# Przewodnik Wdrożeniowy i Szablon Pull Requesta (PR Handoff)

Ten dokument zawiera wszystkie instrukcje techniczne, sekrety i konfiguracje chmurowe, które **nie trafiają bezpośrednio do repozytorium Gita**, ale są niezbędne, aby projekt działał produkcyjnie po zmergowaniu PR-a.

---

## 🚀 Część 1: Jak zgłosić Pull Request do `Aro0713` (Instrukcja dla Bartka)

Gałąź `feature/production-app-postgis` została przygotowana bezpośrednio na bazie gałęzi `main` z repozytorium `Aro0713/gdzie-ta-koperta-dashboard`. Dzięki temu GitHub pokaże czysty diff bez konfliktów historii.

### Krok po kroku:

1. **Zrób Fork repozytorium Aro na GitHubie:**
   * Wejdź na: [https://github.com/Aro0713/gdzie-ta-koperta-dashboard](https://github.com/Aro0713/gdzie-ta-koperta-dashboard)
   * Kliknij przycisk **Fork** w prawym górnym rogu.
   * Powstanie Twoje repozytorium: `https://github.com/808sBartye/gdzie-ta-koperta-dashboard`.

2. **Dodaj swój Fork jako remote w lokalnym terminalu:**
   ```bash
   git remote add fork https://github.com/808sBartye/gdzie-ta-koperta-dashboard.git
   ```

3. **Wypchnij przygotowaną gałąź na swój Fork:**
   ```bash
   git push -u fork feature/production-app-postgis
   ```

4. **Wystaw Pull Request na GitHubie:**
   * Wejdź na [https://github.com/Aro0713/gdzie-ta-koperta-dashboard](https://github.com/Aro0713/gdzie-ta-koperta-dashboard).
   * Zobaczysz żółtą belkę z przyciskiem **Compare & pull request** dla gałęzi `feature/production-app-postgis`.
   * Kliknij go i wklej poniższy opis PR.

---

## 📋 Część 2: Gotowy Szablon Opisu Pull Requesta (Do wklejenia na GitHubie)

### Tytuł PR:
```
feat: Produkcyjna platforma GIS z routingiem subdomen (app.), bazą PostGIS i nową mapą PWA
```

### Treść opisu PR:
```markdown
## ♿ Podsumowanie zmian

W ramach tego PR-a przygotowaliśmy pełną, produkcyjną architekturę systemu **Gdzie Ta Koperta**, rozdzielając serwis na stronę główną / wizerunkową oraz dedykowaną aplikację mapową dla kierowców:

1. **Architektura Pojedynczej Domeny (`gdzietakoperta.pl` + `gdzietakoperta.pl/app`):**
   - **`gdzietakoperta.pl`**: Lekki, wizerunkowy landing page / dashboard z misją projektu, statystykami i poradnikiem dodania skrótu na telefon (ultra-szybki, zero ciężkich bibliotek mapowych pod SEO).
   - **`gdzietakoperta.pl/app`**: Pełnoekranowa, natywna aplikacja nawigacyjna PWA z klastrowaniem, geokodowaniem Photon i routingiem pieszym OSRM.
   - Płynne, natywne przejścia SPA w obie strony (`Link` Next.js) bez zbędnych subdomen i bez potrzeby konfiguracji rekordów CNAME w DNS. Jeśli ktoś wejdzie przez stary adres `app.gdzietakoperta.pl`, middleware automatycznie przekieruje go do `/app`.

2. **Silnik Przestrzenny PostGIS (Spatial Conflation) & Baza Neon:**
   - Zastąpienie statycznych plików JSON i zapytań Overpass API dedykowaną bazą Neon PostgreSQL z rozszerzeniem **PostGIS 3.6**.
   - Indeksy przestrzenne `GiST(geom)` w układzie `EPSG:4326`, zapewniające czas odpowiedzi API poniżej 40 ms.
   - Modułowy silnik ETL (`scripts/etl/runner.ts`) pobierający oficjalne dane z miejskich zarządów dróg: **Gdańsk (CKAN)**, **Wrocław (ZDiUM/GUGiK)**, **Poznań (SIP ZDM)** oraz **Gdynia**, z automatyczną fuzją przestrzenną w promieniu 10 m.

3. **Nowa Aplikacja Nawigacyjna dla Kierowców (PWA):**
   - **Wyszukiwanie celów (Photon):** Po wpisaniu adresu aplikacja wyznacza 4 najbliższe koperty oznaczone literami **A, B, C, D** wraz z odległością w metrach.
   - **Trasa dojścia pieszo (OSRM):** Animowana ścieżka piesza od wybranego stanowiska pod wejście do budynku.
   - **Handoff nawigacyjny:** 1-kliknięcie przenosi cel do Google Maps, Apple Maps, Yanosika lub Waze.
   - **Zgłaszanie kopert ze zdjęciem:** Optymalizacja i kompresja zdjęć w przeglądarce przed wysyłką do Cloudinary CDN.

4. **Panel Moderacji i Bezpieczeństwo (/admin):**
   - Bezpieczna weryfikacja zgłoszeń kierowców.
   - Logowanie przez whitelistę OpenStreetMap OAuth oraz awaryjny klucz `ADMIN_SECRET` z zabezpieczeniem przed atakami typu timing attack (`timingSafeEqual`).

5. **Automatyzacja CI/CD (GitHub Actions):**
   - `.github/workflows/ci.yml`: automatyczny test typów TypeScript oraz build Next.js przy każdym PR.
   - `.github/workflows/sync-gov-data.yml`: coniedzielna automatyczna synchronizacja danych urzędowych z rejestrów miejskich.

---

## ⚙️ Wymagana konfiguracja po stronie Vercel / Środowiska (Handoff Checklist)

Po zmergowaniu PR-a należy ustawić poniższe zmienne środowiskowe w panelu Vercel:

### 1. Zmienne Środowiskowe (Environment Variables na Vercelu):
| Zmienna | Opis | Przykład / Skąd wziąć |
|---|---|---|
| `DATABASE_URL` | Połączenie pooled do bazy Neon Postgres z PostGIS | `postgresql://user:pass@ep-xyz-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require` |
| `DATABASE_URL_UNPOOLED` | Połączenie bezpośrednie do migracji i ETL | `postgresql://user:pass@ep-xyz.eu-central-1.aws.neon.tech/neondb?sslmode=require` |
| `CLOUDINARY_CLOUD_NAME` | Nazwa konta Cloudinary do zdjęć kopert | Dashboard Cloudinary (darmowy tier) |
| `CLOUDINARY_API_KEY` | Klucz publiczny Cloudinary API | Dashboard Cloudinary |
| `CLOUDINARY_API_SECRET` | Klucz tajny Cloudinary API | Dashboard Cloudinary |
| `ADMIN_SECRET` | Losowy silny klucz dostępu do panelu /admin | `openssl rand -hex 32` |
| `ADMIN_OSM_USERS` | Loginy OSM z uprawnieniami moderatora | `Aro0713,808sBartye` |

### 2. Konfiguracja Domen w Vercel:
Wystarczy standardowo podpięta domena główna:
1. `gdzietakoperta.pl` (oraz `www.gdzietakoperta.pl` jako redirect).
Nie są wymagane żadne subdomeny ani dodatkowe rekordy CNAME.

### 3. Inicjalizacja Bazy Danych Neon:
W konsoli SQL bazy Neon (neon.tech) wystarczy jednorazowo włączyć rozszerzenie:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```
Następnie uruchomić migrację ze skryptu `scripts/migrations/002_add_postgis_conflation.sql` lub z poziomu CLI:
```bash
npm run etl:sync
```

### 4. Sekret GitHub Actions:
W repozytorium GitHub (*Settings -> Secrets and variables -> Actions*):
- Dodać `DATABASE_URL` (aby cotygodniowa synchronizacja danych urzędowych z rejestrów miejskich działała automatycznie w cronie).
```

---

## 🔒 Część 3: Bezpieczeństwo i Checklist Sekretów (Czego nie wysyłać)

* **`.env.local`:** Plik pozostaje na Twoim dysku i jest ignorowany w `.gitignore`. Nigdy nie commitujemy tego pliku.
* **Hasła do bazy Neon:** Przekaż login i connection string do bazy Neon programiście bezpośrednio (np. na bezpiecznym komunikatorze lub zaproś go do projektu na Neon.tech przez email).
* **Cloudinary:** Możesz udostępnić wspólny Cloudinary lub założyć nową przestrzeń projektową na Cloudinary dedykowaną dla GdzieTaKoperta.
* **ADMIN_SECRET:** Wygeneruj nowe hasło produkcyjne dla panelu administratora i wpisz je bezpośrednio do zmiennych w Vercelu.
