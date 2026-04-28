import { NextResponse } from "next/server";
import { demoSpots } from "@/lib/demoSpots";

export async function GET() {
  return NextResponse.json({
    type: "FeatureCollection",
    features: demoSpots.map((spot) => ({
      type: "Feature",
      properties: {
        id: spot.id,
        name: spot.name,
        city: spot.city,
        address: spot.address,
        slots: spot.slots,
        status: spot.status,
        confidence: spot.confidence,
        lastVerified: spot.lastVerified,
        tags: spot.tags
      },
      geometry: {
        type: "Point",
        coordinates: [spot.lng, spot.lat]
      }
    }))
  });
}
