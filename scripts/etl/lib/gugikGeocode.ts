/**
 * Darmowy, rządowy geokoder adresów oparty o Uniwersalną Usługę Geokodowania (UUG) GUGiK:
 * https://services.gugik.gov.pl/uug/
 */

const GUGIK_UUG_ENDPOINT = "https://services.gugik.gov.pl/uug/";
const MIN_REQUEST_INTERVAL_MS = 120; // Bezpieczny odstęp między zapytaniami do serwera GUGiK

let lastRequestTimestamp = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTimestamp;
  if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - timeSinceLast);
  }
  lastRequestTimestamp = Date.now();
}

interface GugikResultItem {
  city?: string;
  street?: string;
  number?: string;
  x?: string | number;
  y?: string | number;
  geometry_wkt?: string;
  accuracy?: string;
}

interface GugikResponse {
  type?: string;
  results?: Record<string, GugikResultItem> | null;
  "found objects"?: number;
}

/**
 * Geokoduje adres tekstowy za pomocą publicznej, bezpłatnej usługi GUGiK UUG.
 * Zwraca współrzędne w standardzie WGS84 (EPSG:4326: lat, lng) lub null w przypadku braku wyników.
 */
export async function geocodeAddressGUGiK(
  addressText: string
): Promise<{ lat: number; lng: number } | null> {
  const cleanAddress = addressText.trim().replace(/\s+/g, " ");
  if (!cleanAddress) {
    return null;
  }

  // Warianty zapytań do przetestowania
  const queries: string[] = [];

  // 1. Jeśli adres ma format "Ulica, Miasto", zamień na "Miasto, Ulica"
  if (cleanAddress.includes(",")) {
    const parts = cleanAddress.split(",").map((p) => p.trim());
    if (parts.length === 2) {
      const [p1, p2] = parts;
      // Jeśli p2 to znane miasto (np. Wrocław, Gdańsk, Poznań, Warszawa itp.)
      const cleanP1 = p1.replace(/^(ul\.|al\.|ulica|aleja)\s+/i, "");
      queries.push(`${p2}, ${cleanP1}`);
      queries.push(`${p2}, ${p1}`);
    }
  }

  // 2. Oryginalny ciąg i oczyszczony z prefiksu ul.
  queries.push(cleanAddress);
  const withoutUl = cleanAddress.replace(/^(ul\.|al\.|ulica|aleja)\s+/i, "");
  if (withoutUl !== cleanAddress) {
    queries.push(withoutUl);
  }

  // 3. Warianty z dodanym numerem budynku " 1", jeśli zapytanie nie zawiera żadnej cyfry
  const count = queries.length;
  for (let i = 0; i < count; i++) {
    if (!/\d/.test(queries[i])) {
      queries.push(`${queries[i]} 1`);
    }
  }

  // Przetestuj warianty po kolei (z zachowaniem rate limitu)
  for (const q of queries) {
    const result = await queryGugik(q);
    if (result) {
      return result;
    }
  }

  return null;
}

async function queryGugik(
  query: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    await rateLimit();

    const url = new URL(GUGIK_UUG_ENDPOINT);
    url.searchParams.set("request", "GetAddress");
    url.searchParams.set("address", query);
    url.searchParams.set("result_format", "json");
    url.searchParams.set("srid", "4326");

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "GdzieTaKoperta-ETL/1.0 (GovTech Spatial Conflation; open-source)",
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    if (!text || text.startsWith("Blad") || !text.startsWith("{")) {
      return null;
    }

    const data: GugikResponse = JSON.parse(text);
    if (!data.results) {
      return null;
    }

    // data.results jest obiektem ze stringowymi kluczami np. "1", "2"
    const items = Object.values(data.results);
    if (!items.length) {
      return null;
    }

    const first = items[0];
    if (!first?.x || !first?.y) {
      return null;
    }

    // W formacie EPSG:4326:
    // x odpowiada Długości geograficznej (Longitude, ~14 do ~24 w Polsce)
    // y odpowiada Szerokości geograficznej (Latitude, ~49 do ~55 w Polsce)
    const lng = typeof first.x === "number" ? first.x : parseFloat(String(first.x));
    const lat = typeof first.y === "number" ? first.y : parseFloat(String(first.y));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }

    return null;
  } catch {
    return null;
  }
}
