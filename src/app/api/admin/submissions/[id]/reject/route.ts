import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { deleteImageFromCloudinary } from "@/lib/cloudinary";

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
    const reason = body.reason || "Brak uzasadnienia";
    const mode: "soft_14d" | "hard_spam" = body.mode || "soft_14d";

    const [existing] = (await sql`
      SELECT id, metadata, status
      FROM gtk_osm_submissions
      WHERE id = ${id};
    `) as any[];

    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Zgłoszenie nie istnieje." },
        { status: 404 }
      );
    }

    const photoUrl =
      existing.metadata?.photoUrl ||
      existing.metadata?.imageUrl ||
      existing.metadata?.photoPublicId;

    if (mode === "hard_spam") {
      // 1. Natychmiastowe usunięcie zdjęcia z Cloudinary
      if (photoUrl) {
        try {
          await deleteImageFromCloudinary(photoUrl);
        } catch (imgErr) {
          console.warn("Failed to delete spam photo from Cloudinary:", imgErr);
        }
      }

      // 2. Twarde usunięcie rekordu z bazy Neon
      await sql`
        DELETE FROM gtk_osm_submissions
        WHERE id = ${id};
      `;

      try {
        revalidateTag("spots");
        revalidateTag("gtk_osm_submissions");
        revalidatePath("/");
        revalidatePath("/");
      } catch {}

      return NextResponse.json({
        ok: true,
        id,
        action: "deleted",
        message: "Zgłoszenie zostało trwale usunięte (Spam), a zdjęcie usunięte z CDN.",
      });
    }

    // Opcja A: Zwykłe odrzucenie z 14-dniową retencją zdjęcia
    const deletePhotoAfter = new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000
    ).toISOString();

    const updatedMetadata = {
      ...(existing.metadata || {}),
      rejectionReason: reason,
      rejectedBy: session.username,
      rejectedAt: new Date().toISOString(),
      deletePhotoAfter,
    };

    await sql`
      UPDATE gtk_osm_submissions
      SET
        status = 'rejected',
        metadata = ${JSON.stringify(updatedMetadata)}::jsonb
      WHERE id = ${id};
    `;

    try {
      revalidateTag("spots");
      revalidateTag("gtk_osm_submissions");
      revalidatePath("/");
      revalidatePath("/");
    } catch {}

    return NextResponse.json({
      ok: true,
      id,
      status: "rejected",
      deletePhotoAfter,
      message: "Zgłoszenie zostało odrzucone (zdjęcie zostanie usunięte za 14 dni).",
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_ADMIN") {
      return NextResponse.json({ ok: false, error: "Brak uprawnień." }, { status: 401 });
    }
    console.error("POST /api/admin/submissions/[id]/reject error:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Błąd odrzucania zgłoszenia." },
      { status: 500 }
    );
  }
}
