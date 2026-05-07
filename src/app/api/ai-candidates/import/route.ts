import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CandidateInput = {
  lat?: number;
  lng?: number;
  confidence?: number;
  modelVersion?: string;
  detectionHash?: string;
  imagerySource?: string;
  imageryDate?: string;
  thumbnailUrl?: string | null;
  bbox?: unknown;
  evidence?: unknown;
};

type ImportBody = {
  candidates?: CandidateInput[];
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isValidLatLng(lat: number, lng: number) {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export async function POST(request: NextRequest) {
  const secret = process.env.AI_CANDIDATES_IMPORT_SECRET;

  if (!secret) {
    return jsonError("Missing AI_CANDIDATES_IMPORT_SECRET", 500);
  }

  const auth = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-import-secret");

  const isAuthorized =
    auth === `Bearer ${secret}` || headerSecret === secret;

  if (!isAuthorized) {
    return jsonError("Unauthorized", 401);
  }

  let body: ImportBody;

  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const candidates = body.candidates || [];

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return jsonError("Body must contain candidates array", 400);
  }

  let imported = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const lat = Number(candidate.lat);
    const lng = Number(candidate.lng);
    const confidence = Number(candidate.confidence);
    const modelVersion = String(candidate.modelVersion || "").trim();
    const detectionHash = String(candidate.detectionHash || "").trim();

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !isValidLatLng(lat, lng) ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1 ||
      !modelVersion ||
      !detectionHash
    ) {
      skipped += 1;
      continue;
    }

    const bboxJson = candidate.bbox ? JSON.stringify(candidate.bbox) : null;
    const evidenceJson = JSON.stringify(candidate.evidence || {});

    await sql`
      INSERT INTO gtk_ai_candidates (
        lat,
        lng,
        location,
        bbox,
        detection_hash,
        confidence,
        model_version,
        imagery_source,
        imagery_date,
        thumbnail_url,
        evidence
      )
      VALUES (
        ${lat},
        ${lng},
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${bboxJson}::jsonb,
        ${detectionHash},
        ${confidence},
        ${modelVersion},
        ${candidate.imagerySource || null},
        ${candidate.imageryDate || null},
        ${candidate.thumbnailUrl || null},
        ${evidenceJson}::jsonb
      )
      ON CONFLICT (detection_hash)
      DO UPDATE SET
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        location = EXCLUDED.location,
        bbox = EXCLUDED.bbox,
        confidence = EXCLUDED.confidence,
        model_version = EXCLUDED.model_version,
        imagery_source = EXCLUDED.imagery_source,
        imagery_date = EXCLUDED.imagery_date,
        thumbnail_url = EXCLUDED.thumbnail_url,
        evidence = EXCLUDED.evidence,
        updated_at = now()
    `;

    imported += 1;
  }

  return NextResponse.json({
    ok: true,
    imported,
    skipped
  });
}