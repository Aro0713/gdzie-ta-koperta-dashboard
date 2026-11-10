import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const startLat = parseFloat(searchParams.get("startLat") || "");
  const startLng = parseFloat(searchParams.get("startLng") || "");
  const endLat = parseFloat(searchParams.get("endLat") || "");
  const endLng = parseFloat(searchParams.get("endLng") || "");

  if (
    !Number.isFinite(startLat) ||
    !Number.isFinite(startLng) ||
    !Number.isFinite(endLat) ||
    !Number.isFinite(endLng)
  ) {
    return NextResponse.json(
      { error: "Invalid coordinates provided" },
      { status: 400 }
    );
  }

  const beelineDistance = getHaversineDistanceMeters(
    startLat,
    startLng,
    endLat,
    endLng
  );
  const fallbackDurationSeconds = Math.round(beelineDistance / 1.15); // ~4.1 km/h walking speed

  const fallbackResponse = {
    ok: true,
    coordinates: [
      [startLat, startLng],
      [endLat, endLng]
    ] as [number, number][],
    distanceMeters: beelineDistance,
    durationSeconds: fallbackDurationSeconds,
    isFootRouting: false
  };

  // If distance is excessively far (> 15 km), return straight line immediately
  if (beelineDistance > 15000) {
    return NextResponse.json(fallbackResponse);
  }

  // List of OSRM foot routing servers (primary and backup)
  const servers = [
    `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`,
    `https://router.project-osrm.org/route/v1/foot/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`
  ];

  for (const serverUrl of servers) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(serverUrl, {
        headers: {
          "User-Agent": "GdzieTaKoperta/1.0 (https://www.gdzietakoperta.pl)",
          Accept: "application/json"
        },
        signal: controller.signal,
        cache: "no-store"
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const route = data?.routes?.[0];
        const rawCoords = route?.geometry?.coordinates;

        if (Array.isArray(rawCoords) && rawCoords.length >= 2) {
          // Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
          const leafletCoords: [number, number][] = rawCoords
            .map((coord: number[]) => {
              const lng = coord[0];
              const lat = coord[1];
              if (Number.isFinite(lat) && Number.isFinite(lng)) {
                return [lat, lng] as [number, number];
              }
              return null;
            })
            .filter((c): c is [number, number] => c !== null);

          if (leafletCoords.length >= 2) {
            return NextResponse.json({
              ok: true,
              coordinates: leafletCoords,
              distanceMeters: Math.round(route.distance ?? beelineDistance),
              durationSeconds: Math.round(route.duration ?? fallbackDurationSeconds),
              isFootRouting: true
            });
          }
        }
      }
    } catch {
      // Continue to next server fallback
    }
  }

  // Graceful fallback to straight line
  return NextResponse.json(fallbackResponse);
}
