import type { EtlAdapter, NormalizedGovSpot } from "../types";

/**
 * Adapter Otwartych Danych Miasta Gdyni (ZDiZ Gdynia)
 * Źródło: Oficjalne REST API ZDiZ Gdynia - parkingi w Strefie Płatnego Parkowania
 * https://api.zdiz.gdynia.pl/ri/rest/parkings
 */
const GDYNIA_PARKINGS_URL = "https://api.zdiz.gdynia.pl/ri/rest/parkings";

interface GdyniaParkingItem {
  id: number;
  code?: string;
  name?: string;
  address?: string;
  streetEntrance?: string;
  princing?: string;
  location?: {
    type?: string;
    coordinates?: [number, number]; // [lng, lat]
  };
  lastUpdate?: string;
}

interface GdyniaResponse {
  parkings?: GdyniaParkingItem[];
}

export const gdyniaAdapter: EtlAdapter = {
  name: "Gdynia (ZDiZ Gdynia)",
  authority: "Zarząd Dróg i Zieleni w Gdyni",

  async fetchSpots(): Promise<NormalizedGovSpot[]> {
    console.log("[ETL:Gdynia] Pobieranie parkingów z API ZDiZ Gdynia...");

    const response = await fetch(GDYNIA_PARKINGS_URL, {
      headers: {
        "User-Agent": "GdzieTaKoperta-ETL/1.0",
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`[ETL:Gdynia] Błąd HTTP ${response.status}: ${response.statusText}`);
    }

    const data: GdyniaResponse = await response.json();
    const parkings = data.parkings || [];
    const spots: NormalizedGovSpot[] = [];

    for (const item of parkings) {
      const coords = item.location?.coordinates;
      if (!coords || coords.length < 2) continue;

      const [lng, lat] = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const addressClean = item.address ? item.address.trim() : "";
      const nameClean = item.name ? item.name.trim() : "";
      const displayAddress = addressClean
        ? `Gdynia, ${addressClean}`
        : `Gdynia, ${nameClean || "Parking miejski SPP"}`;

      spots.push({
        externalId: `gdynia_zdiz_${item.id}`,
        sourceType: "gov_official_wfs",
        authority: "Zarząd Dróg i Zieleni w Gdyni",
        name: nameClean || "Parking miejski SPP",
        address: displayAddress,
        lat,
        lng,
        slotsCount: 2,
        trustScore: 90,
        metadata: {
          city: "Gdynia",
          code: item.code,
          notes: item.princing ? `ZDiZ Gdynia (${item.princing})` : "ZDiZ Gdynia - SPP",
          lastUpdate: item.lastUpdate
        }
      });
    }

    console.log(`[ETL:Gdynia] Pomyślnie znormalizowano ${spots.length} lokalizacji.`);
    return spots;
  }
};
