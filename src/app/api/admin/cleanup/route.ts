import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { cleanupExpiredRejectedPhotos } from "@/lib/submissionModeration";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
    const result = await cleanupExpiredRejectedPhotos();
    return NextResponse.json({
      ok: true,
      ...result,
      message: `Wyczyszczono ${result.purgedCount} wygasłych zdjęć.`,
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED_ADMIN") {
      return NextResponse.json({ ok: false, error: "Brak uprawnień." }, { status: 401 });
    }
    return NextResponse.json(
      { ok: false, error: err.message || "Błąd czyszczenia zdjęć." },
      { status: 500 }
    );
  }
}
