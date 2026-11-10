import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { ensureDatabaseSchema, sql } from "@/lib/db";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "@/lib/cloudinary";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await ensureDatabaseSchema();

    const formData = await req.formData();
    const spotId = (formData.get("spotId") as string) || "";
    const lat = parseFloat(formData.get("lat") as string);
    const lng = parseFloat(formData.get("lng") as string);
    const spotName = (formData.get("spotName") as string) || "Koperta parkingowa";
    const address = (formData.get("address") as string) || "";
    const issueCategory = (formData.get("issueCategory") as string) || "removed";
    const issueCategoryLabel = (formData.get("issueCategoryLabel") as string) || "Koperta zlikwidowana / brak miejsca";
    const notes = (formData.get("notes") as string) || "";
    const photo = formData.get("photo") as File | null;

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { ok: false, error: "Nieprawidłowe współrzędne GPS miejsca." },
        { status: 400 }
      );
    }

    let photoUrl: string | null = null;
    let photoPublicId: string | null = null;

    // Obsługa opcjonalnego zdjęcia dowodowego
    if (photo && photo.size > 0) {
      if (isCloudinaryConfigured()) {
        try {
          const bytes = await photo.arrayBuffer();
          const buffer = Buffer.from(bytes);
          const uploadRes = await uploadImageToCloudinary(
            buffer,
            `issue_${spotId || Date.now()}`
          );
          photoUrl = uploadRes.url;
          photoPublicId = uploadRes.publicId;
        } catch (uploadErr) {
          console.error("Cloudinary upload error in /api/spots/report-issue:", uploadErr);
        }
      }
    }

    const metadata = {
      type: "issue_report",
      spotId,
      spotName,
      address,
      issueCategory,
      issueCategoryLabel,
      notes,
      photoUrl,
      photoPublicId,
      reportedAt: new Date().toISOString(),
    };

    // Zapis w bazie Neon PostgreSQL jako zgłoszenie problemu
    await sql`
      INSERT INTO gtk_osm_submissions (
        source_type,
        local_spot_id,
        lat,
        lng,
        status,
        metadata
      )
      VALUES (
        'issue_report',
        ${spotId || null},
        ${lat},
        ${lng},
        'pending',
        ${JSON.stringify(metadata)}
      );
    `;

    revalidateTag("gtk_osm_submissions");

    return NextResponse.json({
      ok: true,
      message: "Dziękujemy! Zgłoszenie zostało przekazane do weryfikacji przez moderatora.",
    });
  } catch (err: any) {
    console.error("Error in /api/spots/report-issue:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Błąd serwera podczas zapisywania zgłoszenia." },
      { status: 500 }
    );
  }
}
