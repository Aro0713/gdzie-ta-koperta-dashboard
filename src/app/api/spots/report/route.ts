import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { sql } from "@/lib/db";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "@/lib/cloudinary";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const lat = parseFloat(formData.get("lat") as string);
    const lng = parseFloat(formData.get("lng") as string);
    const address = (formData.get("address") as string) || "";
    const slotsCount = (formData.get("slotsCount") as string) || "1";
    const notes = (formData.get("notes") as string) || "";
    const photo = formData.get("photo") as File | null;

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { ok: false, error: "Nieprawidłowe współrzędne GPS." },
        { status: 400 }
      );
    }

    const localSpotId = `spot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let photoUrl: string | null = null;
    let photoPublicId: string | null = null;

    // Obsługa uploadu zdjęcia do Cloudinary
    if (photo && photo.size > 0) {
      if (isCloudinaryConfigured()) {
        try {
          const bytes = await photo.arrayBuffer();
          const buffer = Buffer.from(bytes);
          const uploadRes = await uploadImageToCloudinary(
            buffer,
            `spot_${localSpotId}`
          );
          photoUrl = uploadRes.url;
          photoPublicId = uploadRes.publicId;
        } catch (uploadErr) {
          console.error("Cloudinary upload error in /api/spots/report:", uploadErr);
          // Nie blokujemy zgłoszenia miejsca przy błędzie zdjęcia
        }
      } else {
        console.warn(
          "Photo received but Cloudinary is not configured yet (missing CLOUDINARY_CLOUD_NAME)."
        );
      }
    }

    const metadata = {
      address,
      slotsCount,
      notes,
      hasPhoto: Boolean(photoUrl || photo),
      photoUrl,
      photoPublicId,
      submittedAt: new Date().toISOString()
    };

    // Zapis w bazie Neon PostgreSQL
    let dbSuccess = false;
    try {
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
          'community_report',
          ${localSpotId},
          ${lat},
          ${lng},
          'pending_verification',
          ${JSON.stringify(metadata)}::jsonb
        )
      `;
      dbSuccess = true;

      // Inwalidacja tagu Next.js Data Cache
      try {
        revalidateTag("gtk_osm_submissions");
      } catch (cacheErr) {
        console.warn("revalidateTag warning:", cacheErr);
      }
    } catch (dbError) {
      console.warn("DB write failed in /api/spots/report:", dbError);
    }

    return NextResponse.json({
      ok: true,
      id: localSpotId,
      photoUrl,
      dbSaved: dbSuccess,
      message: "Koperta została pomyślnie zgłoszona."
    });
  } catch (error: any) {
    console.error("Report spot error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Błąd serwera." },
      { status: 500 }
    );
  }
}
