import type { EtlAdapter, NormalizedGovSpot } from "../types";

/**
 * Adapter Otwartych Danych Miasta Gdańska (GZDiZ / CKAN)
 * Źródło: Oficjalny rejestr parkingów miejskich i SPP w portalu CKAN Gdańsk
 */
const GDANSK_CKAN_PARKING_URL =
  "https://ckan.multimediagdansk.pl/dataset/cb1e2708-aec1-4b21-9c8c-db2626ae31a6/resource/d361dff3-202b-402d-92a5-445d8ba6fd7f/download/parking-lots.json";

interface GdanskParkingLot {
  id: string;
  name: string;
  shortName?: string;
  address?: string;
  streetEntrance?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

interface GdanskResponse {
  lastUpdate?: string;
  parkingLots?: GdanskParkingLot[];
}

export const gdanskAdapter: EtlAdapter = {
  name: "Gdańsk (GZDiZ / CKAN)",
  authority: "Gdański Zarząd Dróg i Zieleni",

  async fetchSpots(): Promise<NormalizedGovSpot[]> {
    console.log("[ETL:Gdańsk] Pobieranie danych z CKAN GZDiZ...");

    const response = await fetch(GDANSK_CKAN_PARKING_URL, {
      headers: {
        "User-Agent": "GdzieTaKoperta-ETL/1.0",
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`[ETL:Gdańsk] Błąd HTTP ${response.status}: ${response.statusText}`);
    }

    const data: GdanskResponse = await response.json();
    const lots = data.parkingLots || [];
    const spots: NormalizedGovSpot[] = [];

    for (const lot of lots) {
      if (!lot.location?.latitude || !lot.location?.longitude) {
        continue;
      }

      const lat = Number(lot.location.latitude);
      const lng = Number(lot.location.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        continue;
      }

      const addressWithCity = lot.address
        ? `${lot.address.trim()}, Gdańsk`
        : "Gdańsk";

      spots.push({
        externalId: `gdansk_gzdiz_${lot.id}`,
        sourceType: "gov_official_wfs",
        authority: "Gdański Zarząd Dróg i Zieleni",
        name: lot.name || `Parking SPP Gdańsk (${lot.shortName || lot.id})`,
        address: addressWithCity,
        lat,
        lng,
        slotsCount: 2, // Standardowe stanowiska wydzielone dla OzN na parkingach SPP
        trustScore: 90,
        metadata: {
          originalId: lot.id,
          shortName: lot.shortName,
          streetEntrance: lot.streetEntrance,
          syncedAt: new Date().toISOString()
        }
      });
    }

    console.log(`[ETL:Gdańsk] Pobrano i znormalizowano ${spots.length} obiektów.`);
    return spots;
  }
};
