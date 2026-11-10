import https from "node:https";
import type { EtlAdapter, NormalizedGovSpot } from "../types";
import { geocodeAddressGUGiK } from "../lib/gugikGeocode";

/**
 * Adapter oficjalnego wykazu kopert ZDiUM Wrocław
 * Źródło: https://www.zdium.wroc.pl/parkowanie/miejsca-postojowe-dla-pojazdow-osob-niepelnosprawnych/
 */
const WROCLAW_ZDIUM_URL =
  "https://www.zdium.wroc.pl/parkowanie/miejsca-postojowe-dla-pojazdow-osob-niepelnosprawnych/";

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        rejectUnauthorized: false,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GdzieTaKoperta-ETL/1.0",
          Accept: "text/html,application/xhtml+xml,application/xml"
        }
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchHtml(res.headers.location).then(resolve).catch(reject);
          return;
        }

        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve(data));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(12000, () => {
      req.destroy(new Error("Timeout pobierania strony ZDiUM Wrocław"));
    });
  });
}

interface ParsedWroclawItem {
  raw: string;
  street: string;
  slotsCount: number;
  notes?: string;
}

function parseWroclawItem(rawText: string): ParsedWroclawItem {
  // Wyciągnij ewentualny cytat / adnotację w cudzysłowach
  let notes: string | undefined;
  const quoteMatch = rawText.match(/[„"][^”"]+[”"]/);
  if (quoteMatch) {
    notes = quoteMatch[0].replace(/[„"”]/g, "").trim();
  }

  // Wyciągnij liczbę miejsc (np. 2x, 1c, 4x, 2×2)
  let slotsCount = 1;
  const countMatch = rawText.match(/(\d+)\s*[xXcC×]\s*(\d*)/);
  if (countMatch) {
    const firstNum = parseInt(countMatch[1], 10) || 1;
    const secondNum = countMatch[2] ? parseInt(countMatch[2], 10) : 1;
    slotsCount = firstNum * secondNum;
  }

  // Oczyść ulicę
  let street = rawText
    .replace(/[„"][^”"]+[”"]/g, "") // usuń adnotacje
    .replace(/–.*$/, "") // usuń dopiski po myślniku
    .replace(/\d+\s*[xXcC×].*$/, "") // usuń oznaczenie liczby miejsc
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Ujednolicenie prefiksów
  if (!street.startsWith("ul.") && !street.startsWith("pl.")) {
    street = `ul. ${street}`;
  }

  return {
    raw: rawText,
    street,
    slotsCount: Math.max(1, slotsCount),
    notes
  };
}

export const wroclawAdapter: EtlAdapter = {
  name: "Wrocław (ZDiUM)",
  authority: "ZDiUM Wrocław",

  async fetchSpots(limit?: number): Promise<NormalizedGovSpot[]> {
    console.log("[ETL:Wrocław] Pobieranie wykazu kopert ze strony ZDiUM...");
    const html = await fetchHtml(WROCLAW_ZDIUM_URL);

    const olMatch = html.match(/<ol>([\s\S]*?)<\/ol>/i);
    if (!olMatch) {
      throw new Error("[ETL:Wrocław] Nie znaleziono listy <ol> na stronie ZDiUM.");
    }

    let liMatches = [...olMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
    console.log(`[ETL:Wrocław] Znaleziono ${liMatches.length} pozycji w wykazie.`);

    if (limit && limit > 0) {
      console.log(`[ETL:Wrocław] Ograniczenie przetwarzania do pierwszych ${limit} pozycji.`);
      liMatches = liMatches.slice(0, limit);
    }

    const spots: NormalizedGovSpot[] = [];

    for (let i = 0; i < liMatches.length; i++) {
      const rawText = liMatches[i][1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .trim();

      const parsed = parseWroclawItem(rawText);

      // Rozwinięcie popularnych skrótów pod wyższą celność w TERYT/PRG
      let normalizedStreet = parsed.street
        .replace(/Kazimierza Wlk\./i, "Kazimierza Wielkiego")
        .replace(/Powst\. Warszawy/i, "Powstańców Warszawy")
        .replace(/św\./i, "Świętego")
        .replace(/ks\./i, "Księdza")
        .trim();

      // Oczyszczenie z prefiksów dla formatu "Wrocław, {Ulica}"
      const streetWithoutPrefix = normalizedStreet
        .replace(/^(ul\.|pl\.|plac|ulica)\s*/i, "")
        .trim();

      const isPlac = /^pl\.|^plac/i.test(normalizedStreet);
      const gugikAddress = isPlac
        ? `Wrocław, pl. ${streetWithoutPrefix}`
        : `Wrocław, ${streetWithoutPrefix}`;

      // Geokodowanie za pomocą bezpłatnej usługi GUGiK UUG
      const coords = await geocodeAddressGUGiK(gugikAddress);
      if (!coords) {
        console.warn(`[ETL:Wrocław] Nie udało się zgeokodować adresu: "${gugikAddress}" (pomijanie)`);
        continue;
      }

      spots.push({
        externalId: `wroclaw_zdium_${i + 1}`,
        sourceType: "gov_official_wfs",
        authority: "ZDiUM Wrocław",
        name: `Koperta ZDiUM - ${parsed.street}`,
        address: `${parsed.street}, Wrocław`,
        lat: coords.lat,
        lng: coords.lng,
        slotsCount: parsed.slotsCount,
        trustScore: 90,
        metadata: {
          originalEntry: parsed.raw,
          notes: parsed.notes,
          syncedAt: new Date().toISOString()
        }
      });
    }

    console.log(`[ETL:Wrocław] Pomyślnie zgeokodowano i przygotowano ${spots.length} punktów.`);
    return spots;
  }
};
