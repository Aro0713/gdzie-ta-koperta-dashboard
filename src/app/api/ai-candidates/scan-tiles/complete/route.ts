import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isAuthorizedImportRequest } from "@/lib/importSecretAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CompleteBody = {
  tileId?: string;
  candidatesCount?: number;
  error?: string | null;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  if (!process.env.AI_CANDIDATES_IMPORT_SECRET) {
    return jsonError("Missing AI_CANDIDATES_IMPORT_SECRET", 500);
  }

  if (!isAuthorizedImportRequest(request)) {
    return jsonError("Unauthorized", 401);
  }

  let body: CompleteBody;

  try {
    body = (await request.json()) as CompleteBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const tileId = String(body.tileId || "").trim();

  if (!tileId) {
    return jsonError("Missing tileId", 400);
  }

  const candidatesCount = Math.max(0, Number(body.candidatesCount || 0));
  const error = body.error ? String(body.error).slice(0, 1000) : null;

  const rows = await sql`
    UPDATE gtk_ai_scan_tiles
    SET
      scan_count = scan_count + 1,
      last_scanned_at = now(),
      next_scan_after = now() + interval '24 hours',
      last_candidates_count = ${candidatesCount},
      last_error = ${error},
      locked_at = NULL,
      locked_by = NULL,
      updated_at = now()
    WHERE id = ${tileId}
    RETURNING id::text, tile_key
  `;

  if (rows.length === 0) {
    return jsonError("Tile not found", 404);
  }

  return NextResponse.json({
    ok: true,
    tile: rows[0]
  });
}