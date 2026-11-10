import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "";

    const url = ip && ip !== "127.0.0.1" && ip !== "::1"
      ? `http://ip-api.com/json/${ip}`
      : "http://ip-api.com/json/";

    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (data.status === "success" && typeof data.lat === "number" && typeof data.lon === "number") {
        return NextResponse.json({
          lat: data.lat,
          lng: data.lon,
          city: data.city || "Polska",
          source: "ip",
        });
      }
    }
  } catch (err) {
    console.warn("IP Geolocation error:", err);
  }

  // Bezpieczny domyślny fallback
  return NextResponse.json({
    lat: 50.2902,
    lng: 18.6647,
    city: "Gliwice",
    source: "fallback",
  });
}
