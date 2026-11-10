import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { pushApprovedSpotToOsm } from "@/lib/submissionModeration";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdmin(req);
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const { lat, lng, metadataPatch, pushToOsm } = body;

    // Pobierz istniejące zgłoszenie
    const [existing] = (await sql`
      SELECT id, lat, lng, metadata, status
      FROM gtk_osm_submissions
      WHERE id = ${id};
    `) as any[];

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Zgłoszenie nie istnieje." },
        { status: 404 }
      );
    }

    const finalLat = typeof lat === "number" ? lat : existing.lat;
    const finalLng = typeof lng === "number" ? lng : existing.lng;
    const mergedMetadata = {
      ...(existing.metadata || {}),
      ...(metadataPatch || {}),
      approvedAt: new Date().toISOString(),
      approvedBy: session.username,
    };

    let newStatus = "approved";
    let osmDetails: any = null;

    // Jeśli administrator wybrał wysyłkę do OSM i posiada token
    if (pushToOsm) {
      if (!session.osmAccessToken) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Brak aktywnego tokenu OSM. Zaloguj się przez OpenStreetMap, aby móc wysyłać edycje bezpośrednio do mapy.",
          },
          { status: 403 }
        );
      }

      try {
        const osmResult = await pushApprovedSpotToOsm({
          accessToken: session.osmAccessToken,
          lat: finalLat,
          lng: finalLng,
          slotsCount: mergedMetadata.slotsCount,
          notes: mergedMetadata.notes,
        });

        newStatus = "submitted_to_osm";
        osmDetails = osmResult;
        mergedMetadata.osm = osmResult;
      } catch (osmErr: any) {
        console.error("OSM push error during approval:", osmErr);
        return NextResponse.json(
          {
            ok: false,
            error: `Błąd podczas wysyłania do OpenStreetMap: ${osmErr.message}`,
          },
          { status: 502 }
        );
      }
    }

    if (osmDetails) {
      await sql`
        UPDATE gtk_osm_submissions
        SET
          lat = ${finalLat},
          lng = ${finalLng},
          status = ${newStatus},
          metadata = ${JSON.stringify(mergedMetadata)}::jsonb,
          osm_type = 'node',
          osm_id = ${osmDetails.nodeId}::bigint,
          osm_changeset_id = ${osmDetails.changesetId}::bigint,
          osm_url = ${osmDetails.osmUrl},
          submitted_at = NOW(),
          submitted_by_name = ${session.username}
        WHERE id = ${id};
      `;
    } else {
      await sql`
        UPDATE gtk_osm_submissions
        SET
          lat = ${finalLat},
          lng = ${finalLng},
          status = ${newStatus},
          metadata = ${JSON.stringify(mergedMetadata)}::jsonb
        WHERE id = ${id};
      `;
    }

    // Inwalidacja cache Next.js
    try {
      revalidateTag("spots");
      revalidateTag("gtk_osm_submissions");
      revalidatePath("/");
      revalidatePath("/");
    } catch (cacheErr) {
      console.warn("Revalidation warning:", cacheErr);
    }

    return NextResponse.json({
      ok: true,
      id,
      status: newStatus,
      osm: osmDetails,
      message:
        newStatus === "submitted_to_osm"
          ? "Koperta została zatwierdzona i wysłana do OpenStreetMap."
          : "Koperta została pomyślnie zatwierdzona.",
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_ADMIN") {
      return NextResponse.json({ ok: false, error: "Brak uprawnień." }, { status: 401 });
    }
    console.error("POST /api/admin/submissions/[id]/approve error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Błąd zatwierdzania zgłoszenia." },
      { status: 500 }
    );
  }
}
