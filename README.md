# Gdzie Ta Koperta

Platforma GIS oraz aplikacja webowa (PWA) wspierająca kierowców z niepełnosprawnościami w lokalizowaniu, weryfikacji i dojeździe do dedykowanych stanowisk postojowych (tzw. kopert) w polskich miastach.

System łączy rozproszone dane z otwartych rejestrów miejskich zarządów dróg (Gdańsk, Wrocław, Poznań), państwowego rejestru katastralnego EMUiA/GUGiK oraz bazy OpenStreetMap w jedną spójną warstwę przestrzenną PostGIS z automatyczną deduplikacją.

---

## Spis treści

- [Problem domenowy](#problem-domenowy)
- [Architektura techniczna](#architektura-techniczna)
- [Silnik ETL i fuzja przestrzenna (Spatial Conflation)](#silnik-etl-i-fuzja-przestrzenna-spatial-conflation)
- [Weryfikacja wiarygodności i interfejs nawigacyjny](#weryfikacja-wiarygodnosci-i-interfejs-nawigacyjny)
- [Struktura repozytorium](#struktura-repozytorium)
- [Wymagania i zmienne środowiskowe](#wymagania-i-zmienne-srodowiskowe)
- [Instalacja i uruchomienie lokalne](#instalacja-i-uruchomienie-lokalne)
- [Automatyzacja w tle (CI/CD)](#automatyzacja-w-tle-cicd)
- [Licencjonowanie i źródła danych](#licencjonowanie-i-zrodla-danych)

---

## Problem domenowy

W Polsce stanowiska postojowe dla osób z niepełnosprawnościami (karta parkingowa) podlegają różnym zarządcom dróg i nie posiadają jednego, centralnego rejestru krajowego:
- Część danych znajduje się w OpenStreetMap (często bez numeracji i dokładnej weryfikacji terenowej).
- Miejskie zarządy dróg (GZDiZ, ZDiUM, ZDM) publikują własne wykazy – w różnych formatach (CKAN, WFS, rejestry tabelaryczne HTML).
- Kierowca podjeżdżający pod cel (szpital, dworzec, urząd) potrzebuje pewności, czy dane miejsce fizycznie istnieje, ile stanowisk oferuje oraz ile metrów dzieli je od wejścia do budynku.

Gdzie Ta Koperta rozwiązuje ten problem poprzez fuzję danych urzędowych z danymi społecznościowymi oraz bezpośredni handoff do systemów nawigacji samochodowej.

---

## Architektura techniczna

```
                               ┌──────────────────────────────────────────────┐
                               │            ŹRÓDŁA ZEWNĘTRZNE                 │
                               │  - GZDiZ Gdańsk (CKAN / GeoJSON)             │
                               │  - ZDiUM Wrocław (Wykaz HTML) + GUGiK UUG     │
                               │  - ZDM Poznań (SIP REST API)                 │
                               │  - OpenStreetMap (Overpass API)              │
                               └──────────────────────┬───────────────────────┘
                                                      │
                                                      ▼
                                       scripts/etl/runner.ts
                             (Spatial Conflation w buforze 10 metrów)
                                                      │
                                                      ▼
                               ┌──────────────────────────────────────────────┐
                               │          NEON POSTGRESQL + POSTGIS           │
                               │  - Tabela: gtk_osm_submissions               │
                               │  - Kolumna przestrzenna: geom (EPSG:4326)    │
                               │  - Indeks przestrzenny: GiST(geom)           │
                               │  - Metadane źródeł: sources_provenance JSONB │
                               │  - Potwierdzenia: gtk_spot_confirmations     │
                               └──────────────────────┬───────────────────────┘
                                                      │
                                                      ▼
                               ┌──────────────────────────────────────────────┐
                               │           NEXT.JS 15 (APP ROUTER)            │
                               │  - REST API (/api/osm/parking, /api/spots)   │
                               │  - Komponent mapy: Leaflet + Klastrowanie    │
                               │  - Routing pieszy OSRM: /api/route-walking   │
                               │  - Integracja mobilna: PWA / Deep Links      │
                               └──────────────────────┬───────────────────────┘
                                                      │
                 ┌────────────────────────────────────┴────────────────────────────────────┐
                 ▼                                                                         ▼
   Wybór miejsca (A, B, C, D)                                                 Nawigacja zewnętrzna
   - A, B, C: 3 najbliższe celowi                                             - Google Maps
   - D: wskazane z mapy                                                       - Apple Maps
   - Hybrydowa trasa piesza dojścia                                           - Waze / Yanosik
```

### Stack technologiczny

- **Aplikacja & SSR**: Next.js 15.1 (App Router), React 19, TypeScript 5.7.
- **Baza danych & GIS**: Neon Serverless PostgreSQL z rozszerzeniem PostGIS (`@neondatabase/serverless`).
- **Warstwa kartograficzna**: Leaflet 1.9, Leaflet.markercluster, kafelki OpenStreetMap / CartoDB.
- **Geokodowanie adresowe**: Komoot Photon API (wyszukiwanie celów) oraz oficjalne API GUGiK UUG (rejestr EMUiA dla danych urzędowych).
- **Styling**: Tailwind CSS 3.4.

---

## Silnik ETL i fuzja przestrzenna (Spatial Conflation)

Katalog `scripts/etl/` zawiera modułowy silnik synchronizujący publiczne rejestry miast z bazą PostGIS.

### Działanie algorytmu conflation (`scripts/etl/runner.ts`)

1. **Pobranie i normalizacja**: Adaptery miejskie pobierają dane i formatują je do zunifikowanego rekordu (`lat`, `lng`, `authority`, `trustScore`, `slotsCount`). Adresy bez współrzędnych są geokodowane przez bezpłatną usługę EMUiA Głównego Urzędu Geodezji i Kartografii (`scripts/etl/lib/gugikGeocode.ts`).
2. **Weryfikacja bufora 10 metrów (`ST_DWithin`)**:
   Dla każdego punktu silnik wykonuje przestrzenne sprawdzenie w PostGIS:
   ```sql
   SELECT id, confidence_score, sources_provenance
   FROM gtk_osm_submissions
   WHERE ST_DWithin(
     geom,
     ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
     10.0
   )
   LIMIT 1;
   ```
3. **Idempotentny Upsert / Fuzja**:
   - **Gdy punkt istnieje w buforze 10 m**: Rekord nie jest dublowany. Aktualizowany jest wskaźnik `confidence_score` (`LEAST(100, GREATEST(current_score, incoming_trust) + 10)`), status zmienia się na `approved`, a do tablicy `sources_provenance JSONB` dopisywane jest nowe źródło wraz z wyliczoną odległością w metrach (`ST_Distance`).
   - **Gdy punkt nie istnieje**: Wykonywany jest `INSERT` nowego rekordu ze statusem urzędowym (`status = 'approved'`, `source_type = 'gov_official_wfs'`).
   - Klauzula `ON CONFLICT (external_id)` chroni przed ponownym wstawieniem tego samego obiektu przy kolejnych uruchomieniach.

---

## Weryfikacja wiarygodności i interfejs nawigacyjny

### System oznaczeń literowych (A, B, C, D)
W celu uniknięcia pomyłek z liczbą dostępnych stanowisk postojowych, miejsca w pobliżu celu są indeksowane literowo:
- **A, B, C**: Trzy najbliższe koperty względem wybranego adresu docelowego (sortowane po dystansie pieszym).
- **D**: Dodatkowa koperta wskazana przez użytkownika bezpośrednio z mapy.

### Klasyfikacja statusów i kolorystyka
- **Zielony (`#059669` / `bg-emerald-600`)**: Miejsce zweryfikowane urzędowo (pochodzące z oficjalnego rejestru ZDM/GZDiZ/ZDiUM) lub zatwierdzone przez moderatora GTK.
- **Niebieski (`#0284c7` / `bg-sky-600`)**: Miejsce z bazy OpenStreetMap z potwierdzeniem obecności przez kierowców.
- **Bursztynowy (`#d97706` / `bg-amber-600`)**: Miejsce z bazy OpenStreetMap bez potwierdzenia terenowego.

### Potwierdzenia społecznościowe
Użytkownicy mogą potwierdzić obecność miejsca lub zgłosić problem bezpośrednio z poziomu karty nawigacyjnej. Mechanizm deduplikuje głosy w tabeli `gtk_spot_confirmations` w oparciu o hash IP i identyfikator przeglądarki, uniemożliwiając wielokrotne głosowanie z jednego urządzenia.

---

## Struktura repozytorium

```
gdzie-ta-koperta/
├── .github/
│   └── workflows/
│       └── sync-gov-data.yml      # Tygodniowy harmonogram GitHub Actions (CRON)
├── scripts/
│   ├── etl/
│   │   ├── adapters/              # Konektory danych miejskich (Gdańsk, Wrocław, Poznań)
│   │   ├── lib/                   # Klient geokodera katastralnego GUGiK UUG
│   │   ├── runner.ts              # Główny proces fuzji PostGIS i synchronizacji
│   │   └── types.ts               # Typy znormalizowanych rekordów ETL
│   ├── test-system.mjs            # Kompleksowy test integracyjny API i bazy
│   └── verify-db-postgis.ts       # Weryfikacja geometrii i schematu PostGIS w Neonie
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── osm/parking/       # Zwraca zbiór GeoJSON łączący OSM i PostGIS
│   │   │   ├── route-walking/     # Hybrydowe wyznaczanie trasy pieszej (OSRM / beeline)
│   │   │   └── spots/             # Obsługa zgłoszeń i potwierdzeń kierowców
│   │   ├── admin/                 # Panel moderacji zgłoszeń społecznościowych
│   │   └── page.tsx               # Główny ekran aplikacji (wyszukiwanie + mapa)
│   ├── components/
│   │   ├── GtkMap.tsx             # Komponent mapy Leaflet (klastry, warstwa A/B/C/D)
│   │   ├── NearbySpotsList.tsx    # Lista najbliższych kopert wokół zablokowanego celu
│   │   ├── NavigationActionSheet.tsx # Drawer z wyborem nawigacji (Google, Apple, Waze)
│   │   └── DestinationSearch.tsx  # Autocomplete adresów w Polsce (Komoot Photon)
│   └── lib/
│       ├── db.ts                  # Klient połączenia z Neon PostgreSQL
│       └── osmParking.ts          # Parsowanie i normalizacja tagów OpenStreetMap
└── package.json
```

---

## Wymagania i zmienne środowiskowe

### Wymagania
- Node.js 20.x lub nowszy
- Baza danych PostgreSQL z aktywnym rozszerzeniem PostGIS (rekomendowany Neon Serverless Postgres)

### Konfiguracja `.env.local`

Skopiuj plik `.env.example` do `.env.local` i uzupełnij parametry:

```bash
# Baza danych Neon PostGIS
DATABASE_URL="postgresql://user:password@ep-xyz.eu-central-1.aws.neon.tech/neondb?sslmode=require"
DATABASE_URL_UNPOOLED="postgresql://user:password@ep-xyz-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require"

# Kafelki mapy
NEXT_PUBLIC_TILE_URL="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
NEXT_PUBLIC_TILE_ATTRIBUTION="&copy; OpenStreetMap contributors"

# Panel moderatora
ADMIN_SECRET="twoj-tajny-klucz-sesji-admina"
ADMIN_OSM_USERS="nazwa_uzytkownika_osm"

# Opcjonalnie: Cloudinary (do hostingu zdjęć zgłaszanych kopert)
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""
```

---

## Instalacja i uruchomienie lokalne

```bash
# 1. Instalacja zależności
npm install

# 2. Sprawdzenie połączenia z bazą i rozszerzenia PostGIS
npm run test:db

# 3. Synchronizacja danych z rejestrów miejskich (ETL)
npm run etl:sync

# 4. Uruchomienie serwera deweloperskiego
npm run dev
```

Aplikacja dostępna jest pod adresem: `http://localhost:3000`.

### Przydatne skrypty w `package.json`

| Komenda | Opis |
|---|---|
| `npm run dev` | Uruchamia serwer deweloperski Next.js |
| `npm run build` | Kompiluje aplikację i sprawdza poprawność typów TypeScript |
| `npm run typecheck` | Samodzielna weryfikacja typów `tsc --noEmit` |
| `npm run etl:sync` | Ręczne wykonanie fuzji przestrzennej dla Gdańska, Wrocławia i Poznania |
| `npm run test:db` | Test schematu tabel, indeksów przestrzennych i zapytań `ST_DWithin` |
| `npm run test:system` | Test integracyjny endpointów REST i odczytu punktów z bazy |

---

## Automatyzacja w tle (CI/CD)

Workflow `.github/workflows/sync-gov-data.yml` odpowiada za bezobsługową synchronizację danych:
- **Harmonogram**: Uruchamia się w każdą niedzielę o 03:00 UTC.
- **Ręczne uruchomienie**: Obsługuje `workflow_dispatch` z opcją wyboru konkretnego miasta (`gdansk`, `wroclaw`, `poznan` lub wszystkie).
- **Wymagany sekret w repozytorium GitHub**: `DATABASE_URL` (konfigurowany w *Settings -> Secrets and variables -> Actions*).

---

## Licencjonowanie i źródła danych

- **Kod źródłowy**: Dostępny na licencji MIT.
- **Dane OpenStreetMap**: Podlegają licencji [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/).
- **Otwarte dane miejskie**: Dane pozyskane z publicznych portali otwartych danych i BIP jednostek miejskich (Gdański Zarząd Dróg i Zieleni, Zarząd Dróg i Utrzymania Miasta we Wrocławiu, Zarząd Dróg Miejskich w Poznaniu).
- **Geokodowanie katastralne**: Usługa Universal Utility Geocoder (UUG) Głównego Urzędu Geodezji i Kartografii w oparciu o bazę Ewidencji Miejscowości, Ulic i Adresów (EMUiA).
