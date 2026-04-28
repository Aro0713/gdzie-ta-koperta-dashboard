# Gdzie ta koperta?

**Gdzie ta koperta?** to społeczna aplikacja mapowa wspierająca osoby z niepełnosprawnościami w odnajdywaniu miejsc parkingowych uprzywilejowanych, potocznie nazywanych „kopertami”.

Projekt ma jeden podstawowy cel: sprawić, aby dostępność przestrzeni miejskiej była realna, aktualna i użyteczna w codziennym życiu.

> Dostępność nie może być teorią. Musi być dla ludzi, musi być realna i musi działać wtedy, kiedy ktoś naprawdę jej potrzebuje.

---

## Założenie projektu

Aplikacja ma działać jako otwarta, przyjazna i darmowa dla użytkowników mapa miejsc parkingowych dla osób z niepełnosprawnościami.

Użytkownik powinien móc:

- znaleźć najbliższą kopertę,
- sprawdzić jej status,
- dodać nowe miejsce,
- potwierdzić istniejące miejsce,
- zgłosić problem z oznakowaniem,
- przygotować zgłoszenie lub wniosek do właściwego urzędu.

Projekt nie zakłada pobierania opłat od osób z niepełnosprawnościami. Aplikacja ma być bezpłatna dla użytkownika końcowego.

---

## Status

Aktualny etap: **MVP / dashboard startowy**.

Obecna wersja zawiera:

- stronę główną dashboardu,
- mapę demo,
- przykładowe punkty kopert,
- widok zgłaszania nowej koperty,
- widok przygotowania wniosku do urzędu,
- demo API zwracające dane w formacie GeoJSON.

To nie jest jeszcze pełny system produkcyjny. Jest to fundament pod dalszą rozbudowę aplikacji.

---

## Główne funkcje planowane

### 1. Mapa kopert

Interaktywna mapa pokazująca miejsca parkingowe przeznaczone dla osób z niepełnosprawnościami.

Docelowo mapa powinna obsługiwać:

- aktualną lokalizację użytkownika,
- wyszukiwanie najbliższych kopert,
- filtrowanie po statusie,
- klastrowanie punktów,
- nawigację do wybranego miejsca,
- integrację z danymi OpenStreetMap.

---

### 2. Społeczne dodawanie punktów

Użytkownik będzie mógł zgłosić nową kopertę bez skomplikowanego formularza.

Minimalny zakres danych:

- lokalizacja GPS,
- adres lub opis miejsca,
- liczba stanowisk,
- zdjęcie oznakowania,
- status miejsca,
- krótka uwaga terenowa.

Najważniejsza zasada: użytkownik ma dodać punkt szybko, bez biurokratycznego rytuału godnego kontroli skarbowej.

---

### 3. Weryfikacja społecznościowa

Każde miejsce powinno mieć status aktualności.

Przykładowe statusy:

- potwierdzona,
- do weryfikacji,
- problem z oznakowaniem,
- usunięta,
- niedostępna,
- zajęta nieuprawnienie.

Dane powinny być oceniane na podstawie:

- liczby potwierdzeń,
- daty ostatniej weryfikacji,
- zdjęć,
- zgłoszeń użytkowników,
- reputacji zgłaszających.

---

### 4. Moduł wniosku do urzędu

Aplikacja ma być czymś więcej niż mapą.

Docelowo powinna umożliwiać przygotowanie zgłoszenia lub wniosku do właściwej instytucji, np.:

- urzędu miasta,
- zarządu dróg,
- straży miejskiej,
- administratora terenu,
- spółdzielni lub wspólnoty.

Wniosek powinien zawierać:

- lokalizację,
- zdjęcie,
- opis problemu,
- datę zgłoszenia,
- dane techniczne miejsca,
- wygenerowany dokument PDF lub gotową treść wiadomości.

---

### 5. Integracja z OpenStreetMap

Projekt powinien korzystać z ekosystemu OpenStreetMap jako otwartej bazy danych geograficznych.

Planowane użycie OSM:

- podkład mapowy,
- import istniejących danych o parkingach,
- analiza danych przez Overpass API,
- porównanie danych społecznościowych z danymi OSM,
- potencjalne przekazywanie potwierdzonych poprawek z powrotem do OSM.

Ważne: aplikacja nie powinna być tylko statyczną mapą OSM. Rdzeniem projektu ma być własna warstwa danych: statusy, zdjęcia, zgłoszenia, wnioski i historia weryfikacji.

---

## Stack technologiczny

Aktualny stack MVP:

- **Next.js** — framework aplikacji,
- **React** — interfejs użytkownika,
- **TypeScript** — typowanie,
- **Leaflet** — mapa interaktywna,
- **OpenStreetMap** — podkład mapowy,
- **GeoJSON** — format danych geograficznych,
- **Vercel** — hosting i deployment.

Planowany stack docelowy:

- **Supabase** — baza danych, auth, storage,
- **PostgreSQL + PostGIS** — obsługa danych geograficznych,
- **Overpass API** — import danych z OpenStreetMap,
- **Supabase Storage** — zdjęcia kopert,
- **Edge Functions / API Routes** — logika backendowa,
- **PDF generator** — generowanie wniosków do urzędów.

---

## Ścieżki aplikacji

Aktualne widoki MVP:

| Ścieżka | Opis |
|---|---|
| `/` | Dashboard główny |
| `/mapa` | Widok mapy kopert |
| `/zglos` | Formularz zgłoszenia koperty |
| `/wniosek` | Makieta modułu wniosku do urzędu |
| `/api/spots` | Demo API zwracające GeoJSON |

---

## API demo

Endpoint:

```text
/api/spots
```

Zwraca dane w formacie GeoJSON:

```json
{
  "type": "FeatureCollection",
  "features": []
}
```

Docelowo ten endpoint powinien pobierać dane z bazy PostGIS, a nie z danych demonstracyjnych.

---

## Uruchomienie lokalne

Instalacja zależności:

```bash
npm install
```

Uruchomienie aplikacji developerskiej:

```bash
npm run dev
```

Aplikacja lokalna będzie dostępna pod adresem:

```text
http://localhost:3000
```

---

## Deployment

Aplikacja jest przygotowana do wdrożenia na **Vercel**.

Typowy proces:

1. Utworzenie repozytorium na GitHub.
2. Wysłanie kodu do repozytorium.
3. Import projektu w Vercel.
4. Deployment jako aplikacja Next.js.

Vercel automatycznie wykrywa framework i uruchamia build.

---

## Zmienne środowiskowe

Przykładowe zmienne środowiskowe:

```env
NEXT_PUBLIC_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
NEXT_PUBLIC_TILE_ATTRIBUTION=&copy; OpenStreetMap contributors
```

W MVP można korzystać z publicznego podkładu OSM. Przy większym ruchu należy przejść na własny tile server albo odpowiedniego dostawcę kafelków.

---

## Docelowy model danych

Przykładowe encje produkcyjne:

### `spots`

Miejsca parkingowe / koperty.

Pola:

- `id`,
- `type`,
- `geom`,
- `address`,
- `city`,
- `slots_count`,
- `status`,
- `confidence_score`,
- `created_by`,
- `created_at`,
- `last_verified_at`.

### `spot_photos`

Zdjęcia miejsc.

Pola:

- `id`,
- `spot_id`,
- `url`,
- `created_by`,
- `created_at`.

### `spot_verifications`

Potwierdzenia społecznościowe.

Pola:

- `id`,
- `spot_id`,
- `user_id`,
- `verification_type`,
- `comment`,
- `created_at`.

### `official_requests`

Zgłoszenia i wnioski do urzędów.

Pola:

- `id`,
- `spot_id`,
- `request_type`,
- `institution_name`,
- `status`,
- `pdf_url`,
- `created_by`,
- `created_at`.

---

## Zasada projektowa

Aplikacja powinna być:

- prosta,
- szybka,
- darmowa dla użytkownika,
- dostępna cyfrowo,
- oparta o otwarte mapy,
- odporna na nieaktualne dane,
- możliwa do rozwijania przez społeczność.

To ma być narzędzie pomagające ludziom w realnym świecie, nie tylko kolejna ładna mapa.

---

## Misja

Osoby z niepełnosprawnościami nie powinny krążyć po mieście w poszukiwaniu miejsca, które powinno być dostępne z definicji.

**Gdzie ta koperta?** ma pomóc znaleźć takie miejsca, oznaczać problemy i tworzyć lepszą, bardziej uczciwą przestrzeń miejską.

Dostępność musi działać w praktyce.
