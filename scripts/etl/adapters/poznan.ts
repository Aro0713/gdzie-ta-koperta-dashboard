import type { EtlAdapter, NormalizedGovSpot } from "../types";

/**
 * Adapter Otwartego Rejestru Kopert / Parkingów ZDM Poznań
 * Źródło: Oficjalne API Systemu Informacji Przestrzennej Miasta Poznania (Plan Poznania / ZDM)
 */
const POZNAN_ZDM_PARKINGS_URL =
  "https://www.poznan.pl/mim/plan/map_service.html?mtype=pub_transport&co=parkingi_zdm_monitoring";

interface PoznanFeature {
  id: string;
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number]; // [lng, lat]
  };
  properties: {
    name?: string;
    adres?: string;
    opis?: string;
    m_niepelnosprawni?: string | number;
    pojemnosc?: string | number;
    platnosc?: string;
    godziny?: string;
  };
}

interface PoznanResponse {
  features?: PoznanFeature[];
  error_msg?: string;
}

export const poznanAdapter: EtlAdapter = {
  name: "Poznań (ZDM Poznań)",
  authority: "ZDM Poznań",

  async fetchSpots(): Promise<NormalizedGovSpot[]> {
    console.log("[ETL:Poznań] Pobieranie danych z API ZDM Poznań...");

    const response = await fetch(POZNAN_ZDM_PARKINGS_URL, {
      headers: {
        "User-Agent": "GdzieTaKoperta-ETL/1.0",
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`[ETL:Poznań] Błąd HTTP ${response.status}: ${response.statusText}`);
    }

    const data: PoznanResponse = await response.json();
    if (data.error_msg) {
      throw new Error(`[ETL:Poznań] Błąd API: ${data.error_msg}`);
    }

    const features = data.features || [];
    const spots: NormalizedGovSpot[] = [];

    for (const feat of features) {
      if (!feat.geometry?.coordinates || feat.geometry.coordinates.length < 2) {
        continue;
      }

      const [lng, lat] = feat.geometry.coordinates;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        continue;
      }

      const props = feat.properties || {};
      const disabledCount = parseInt(String(props.m_niepelnosprawni || "1"), 10) || 1;

      const addressWithCity = props.adres
        ? `${props.adres.trim()}, Poznań`
        : "Poznań";

      spots.push({
        externalId: `poznan_zdm_${feat.id}`,
        sourceType: "gov_official_wfs",
        authority: "ZDM Poznań",
        name: props.name || props.opis || `Parking ZDM (${feat.id})`,
        address: addressWithCity,
        lat,
        lng,
        slotsCount: disabledCount,
        trustScore: 90,
        metadata: {
          originalId: feat.id,
          totalCapacity: props.pojemnosc,
          payment: props.platnosc,
          hours: props.godziny,
          syncedAt: new Date().toISOString()
        }
      });
    }

    console.log(`[ETL:Poznań] Pobrano i znormalizowano ${spots.length} obiektów.`);
    return spots;
  }
};
