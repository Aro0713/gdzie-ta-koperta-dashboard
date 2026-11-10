export interface GeocodingResult {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
}

// Bounding box obejmujący całą Polskę (minLon, minLat, maxLon, maxLat)
const POLAND_BBOX = "14.12,49.00,24.15,54.84";

export async function searchDestinations(query: string, limit = 5): Promise<GeocodingResult[]> {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return [];

  try {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", cleanQuery);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("bbox", POLAND_BBOX);

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Photon API error: ${res.status}`);
    }

    const data = await res.json();
    if (!data?.features || !Array.isArray(data.features)) {
      return [];
    }

    return data.features.map((feature: any, index: number) => {
      const p = feature.properties || {};
      const [lng, lat] = feature.geometry?.coordinates || [0, 0];
      
      const titleParts = [p.name, p.street ? `${p.street} ${p.housenumber || ""}`.trim() : null].filter(Boolean);
      const title = titleParts[0] || p.city || "Punkt docelowy";
      
      const descParts = [
        p.street && title !== p.street ? `${p.street} ${p.housenumber || ""}`.trim() : null,
        p.district,
        p.city,
        p.state,
      ].filter(Boolean);

      return {
        id: String(p.osm_id || `${lat}-${lng}-${index}`),
        name: title,
        description: descParts.join(", "),
        lat,
        lng,
      };
    });
  } catch (error) {
    console.error("Geocoding failed:", error);
    return [];
  }
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<{ name: string; description: string }> {
  try {
    const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("Reverse geocode failed");
    const data = await res.json();
    const feat = data?.features?.[0];
    if (feat) {
      const p = feat.properties || {};
      const street = p.street ? `${p.street} ${p.housenumber || ""}`.trim() : null;
      const name = p.name || street || p.city || "Punkt na mapie";
      const descParts = [street && name !== street ? street : null, p.district, p.city].filter(Boolean);
      return {
        name,
        description: descParts.join(", "),
      };
    }
  } catch (err) {
    console.warn("Reverse geocode error:", err);
  }
  return {
    name: "Wybrany punkt na mapie",
    description: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
  };
}
