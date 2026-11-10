import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const secret = process.env.REVALIDATE_SECRET || process.env.CRON_SECRET;

    if (secret) {
      const url = new URL(req.url);
      const querySecret = url.searchParams.get("secret");
      const bearerToken = authHeader?.replace(/^Bearer\s+/i, "");

      if (querySecret !== secret && bearerToken !== secret) {
        return NextResponse.json(
          { ok: false, error: "Brak autoryzacji do rewalidacji cache." },
          { status: 401 }
        );
      }
    }

    // Rewalidacja tagów danych kopert
    revalidateTag("spots");
    revalidateTag("gtk_osm_submissions");
    revalidateTag("gtk-osm-submissions-features");
    revalidateTag("gtk-suppressed-spot-keys");

    // Rewalidacja głównych ścieżek widoków
    revalidatePath("/");
    revalidatePath("/");

    return NextResponse.json({
      ok: true,
      message: "Cache kopert i widoków mapy został pomyślnie zrewalidowany.",
      tags: ["spots", "gtk_osm_submissions"],
      revalidatedAt: new Date().toISOString()
    });
  } catch (err: any) {
    console.error("Błąd rewalidacji cache:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "Błąd rewalidacji" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
