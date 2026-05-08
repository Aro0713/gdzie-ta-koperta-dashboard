import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TileRow = {
  id: string;
  tile_key: string;
  west: number;
  south: number;
  east: number;
  north: number;
  priority: number;
  scan_count: number;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: NextRequest) {
  const secret = process.env.AI_CANDIDATES_IMPORT_SECRET;

  if (!secret) {
    return jsonError("Missing AI_CANDIDATES_IMPORT_SECRET", 500);
  }

  const auth = request.headers.get("authorization");

  if (auth !== `Bearer ${secret}`) {
    return jsonError("Unauthorized", 401);
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body.limit || 4), 20));
  const workerId = String(body.workerId || "github-actions").slice(0, 120);

  const rows = (await sql`
    WITH selected AS (
      SELECT id
      FROM gtk_ai_scan_tiles
      WHERE
        status = 'active'
        AND next_scan_after <= now()
        AND (
          locked_at IS NULL
          OR locked_at < now() - interval '45 minutes'
        )
      ORDER BY
        priority ASC,
        last_scanned_at ASC NULLS FIRST,
        next_scan_after ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE gtk_ai_scan_tiles AS tile
    SET
      locked_at = now(),
      locked_by = ${workerId},
      updated_at = now()
    FROM selected
    WHERE tile.id = selected.id
    RETURNING
      tile.id::text,
      tile.tile_key,
      tile.west::float,
      tile.south::float,
      tile.east::float,
      tile.north::float,
      tile.priority,
      tile.scan_count
  `) as TileRow[];

  return NextResponse.json({
    ok: true,
    tiles: rows.map((row) => ({
      id: row.id,
      tileKey: row.tile_key,
      west: row.west,
      south: row.south,
      east: row.east,
      north: row.north,
      priority: row.priority,
      scanCount: row.scan_count
    }))
  });
}