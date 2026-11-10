import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin(req);
    const { id } = await params;

    const [issueReport] = (await sql`
      SELECT id, lat, lng, metadata, status, source_type
      FROM gtk_osm_submissions
      WHERE id = ${id};
    `) as any[];

    if (!issueReport) {
      return NextResponse.json(
        { ok: false, error: "Zgłoszenie problemu nie istnieje." },
        { status: 404 }
      );
    }

    const meta = issueReport.metadata || {};
    const targetSpotId = meta.spotId || null;
    const targetLat = issueReport.lat ? Number(issueReport.lat) : null;
    const targetLng = issueReport.lng ? Number(issueReport.lng) : null;

    // 1. Zaktualizuj samo zgłoszenie problemu na 'confirmed_removed'
    const updatedMeta = {
      ...meta,
      confirmedAt: new Date().toISOString(),
      confirmedBy: session.username,
      resolution: "spot_removed",
    };

    await sql`
      UPDATE gtk_osm_submissions
      SET
        status = 'confirmed_removed',
        metadata = ${JSON.stringify(updatedMeta)}::jsonb
      WHERE id = ${id};
    `;

    // 2. Jeśli zgłoszenie dotyczyło istniejącej koperty w gtk_osm_submissions, oznacz ją jako 'removed'
    if (targetSpotId) {
      await sql`
        UPDATE gtk_osm_submissions
        SET status = 'removed'
        WHERE (id = ${targetSpotId} OR osm_id::text = ${targetSpotId} OR local_spot_id = ${targetSpotId})
          AND id != ${id};
      `;
    }

    // 3. Jeśli mamy współrzędne, ukryj również bezpośrednio pasujące wpisy w promieniu ~15 metrów
    if (targetLat !== null && targetLng !== null) {
      await sql`
        UPDATE gtk_osm_submissions
        SET status = 'removed'
        WHERE id != ${id}
          AND status IN ('submitted_to_osm', 'approved', 'pending')
          AND ABS(lat - ${targetLat}) < 0.00015
          AND ABS(lng - ${targetLng}) < 0.00015;
      `;
    }

    // 4. Inwalidacja cache
    try {
      revalidateTag("spots");
      revalidateTag("gtk_osm_submissions");
      revalidatePath("/");
      revalidatePath("/");
      revalidatePath("/admin");
    } catch {}

    return NextResponse.json({
      ok: true,
      id,
      message: "Potwierdzono likwidację miejsca. Miejsce zostało pomyślnie ukryte z mapy.",
    });
  } catch (error: any) {
    console.error("Admin confirm issue error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Błąd serwera." },
      { status: 500 }
    );
  }
}
