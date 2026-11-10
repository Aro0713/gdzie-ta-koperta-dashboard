import { NextRequest, NextResponse } from "next/server";
import { ensureDatabaseSchema, sql } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { cleanupExpiredRejectedPhotos } from "@/lib/submissionModeration";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    await ensureDatabaseSchema();

    // Uruchomienie czyszczenia wygasłych zdjęć w tle (nieblokująco)
    cleanupExpiredRejectedPhotos().catch((err) => {
      console.warn("Background photo cleanup error:", err);
    });

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status") || "pending";

    // 1. Pobranie zagregowanych liczników dla wszystkich statusów
    const [counts] = (await sql`
      SELECT
        COUNT(CASE WHEN status IN ('pending_verification', 'pending') THEN 1 END)::int AS pending_count,
        COUNT(CASE WHEN status = 'approved' THEN 1 END)::int AS approved_count,
        COUNT(CASE WHEN status = 'submitted_to_osm' THEN 1 END)::int AS osm_count,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END)::int AS rejected_count,
        COUNT(*)::int AS total_count
      FROM gtk_osm_submissions;
    `) as Array<{
      pending_count: number;
      approved_count: number;
      osm_count: number;
      rejected_count: number;
      total_count: number;
    }>;

    // 2. Pobranie zgłoszeń dla wybranego filtra
    let rows: any[] = [];
    if (statusFilter === "pending" || statusFilter === "pending_verification") {
      rows = await sql`
        SELECT
          id,
          source_type,
          local_spot_id,
          lat,
          lng,
          status,
          metadata,
          osm_type,
          osm_id,
          osm_changeset_id,
          osm_url,
          submitted_at,
          created_at,
          external_id,
          confidence_score,
          sources_provenance,
          last_verified_at
        FROM gtk_osm_submissions
        WHERE status IN ('pending_verification', 'pending')
        ORDER BY created_at DESC;
      `;
    } else if (statusFilter === "all") {
      rows = await sql`
        SELECT
          id,
          source_type,
          local_spot_id,
          lat,
          lng,
          status,
          metadata,
          osm_type,
          osm_id,
          osm_changeset_id,
          osm_url,
          submitted_at,
          created_at,
          external_id,
          confidence_score,
          sources_provenance,
          last_verified_at
        FROM gtk_osm_submissions
        ORDER BY created_at DESC;
      `;
    } else {
      rows = await sql`
        SELECT
          id,
          source_type,
          local_spot_id,
          lat,
          lng,
          status,
          metadata,
          osm_type,
          osm_id,
          osm_changeset_id,
          osm_url,
          submitted_at,
          created_at,
          external_id,
          confidence_score,
          sources_provenance,
          last_verified_at
        FROM gtk_osm_submissions
        WHERE status = ${statusFilter}
        ORDER BY created_at DESC;
      `;
    }

    return NextResponse.json({
      ok: true,
      counts: {
        pending: counts?.pending_count || 0,
        approved: counts?.approved_count || 0,
        submitted_to_osm: counts?.osm_count || 0,
        rejected: counts?.rejected_count || 0,
        total: counts?.total_count || 0,
      },
      submissions: rows,
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_ADMIN") {
      return NextResponse.json({ ok: false, error: "Brak uprawnień." }, { status: 401 });
    }
    console.error("GET /api/admin/submissions error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Błąd pobierania zgłoszeń." },
      { status: 500 }
    );
  }
}
