import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CandidateRow = {
  id: string;
  status: string;
  lat: number;
  lng: number;
  confidence: number;
  model_version: string;
  imagery_source: string | null;
  thumbnail_url: string | null;
  created_at: string;
};

export async function GET() {
  try {
    const rows = (await sql`
      SELECT
        id::text,
        status::text,
        ST_Y(location::geometry)::float AS lat,
        ST_X(location::geometry)::float AS lng,
        confidence::float,
        model_version,
        imagery_source,
        thumbnail_url,
        created_at::text
      FROM gtk_ai_candidates
      WHERE status = 'needs_review'
      ORDER BY confidence DESC, created_at DESC
      LIMIT 200
    `) as CandidateRow[];

    return NextResponse.json({
      ok: true,
      candidates: rows.map((row) => ({
        id: row.id,
        status: row.status,
        lat: row.lat,
        lng: row.lng,
        confidence: row.confidence,
        modelVersion: row.model_version,
        imagerySource: row.imagery_source,
        thumbnailUrl: row.thumbnail_url,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database error";

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load AI candidates",
        details: message
      },
      {
        status: 500
      }
    );
  }
}