import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/spots/confirm
 * Zapisuje potwierdzenie kierowcy (lajk weryfikacyjny a'la Yanosik) dla koperty parkingowej.
 * Nie tworzy zdublowanych rekordów w bazie ani nie zamienia miejsc z OSM w sztuczne punkty urzędowe.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const spotId = String(body.spotId || body.id || "").trim();

    if (!spotId) {
      return NextResponse.json(
        { ok: false, error: "Brak identyfikatora miejsca (spotId)." },
        { status: 400 }
      );
    }

    // 1. Zapisz lub podbij potwierdzenie w tabeli gtk_spot_confirmations
    const result = await sql`
      INSERT INTO gtk_spot_confirmations (spot_id, confirmations_count, last_confirmed_at)
      VALUES (${spotId}, 1, NOW())
      ON CONFLICT (spot_id)
      DO UPDATE SET
        confirmations_count = gtk_spot_confirmations.confirmations_count + 1,
        last_confirmed_at = NOW()
      RETURNING confirmations_count;
    `;

    const count = result[0]?.confirmations_count || 1;

    // 2. Jeśli ten punkt jest już własnym zgłoszeniem w gtk_osm_submissions, odśwież jego last_verified_at
    await sql`
      UPDATE gtk_osm_submissions
      SET
        last_verified_at = NOW(),
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{confirmations}',
          ${JSON.stringify(count)}::jsonb
        )
      WHERE id::text = ${spotId}
         OR local_spot_id = ${spotId}
         OR (osm_id::text = ${spotId} AND osm_id IS NOT NULL);
    `.catch(() => {});

    try {
      revalidateTag("gtk_osm_submissions");
      revalidateTag("spots");
    } catch {}

    return NextResponse.json({
      ok: true,
      spotId,
      confirmationsCount: count,
      message: "Potwierdzenie kierowcy zostało zarejestrowane."
    });
  } catch (error) {
    console.error("[api/spots/confirm] Błąd rejestracji potwierdzenia:", error);
    return NextResponse.json(
      { ok: false, error: "Błąd serwera podczas zapisywania potwierdzenia." },
      { status: 500 }
    );
  }
}
