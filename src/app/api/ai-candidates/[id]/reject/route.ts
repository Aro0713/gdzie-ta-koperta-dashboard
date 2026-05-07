import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  OSM_SESSION_COOKIE,
  decryptSession,
  isSessionValid
} from "@/lib/osmOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RejectBody = {
  reason?: string;
  note?: string;
};

const ALLOWED_REASONS = new Set([
  "not_disabled_parking",
  "no_blue_envelope",
  "private_access",
  "not_publicly_accessible",
  "duplicate_existing_osm",
  "duplicate_candidate",
  "bad_imagery",
  "wrong_location",
  "low_confidence",
  "other"
]);

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const cookieStore = await cookies();
  const rawSession = cookieStore.get(OSM_SESSION_COOKIE)?.value;
  const session = rawSession ? decryptSession(rawSession) : null;

  if (!isSessionValid(session)) {
    return jsonError("User is not authenticated with OpenStreetMap", 401);
  }

  let body: RejectBody;

  try {
    body = (await request.json()) as RejectBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const reason = String(body.reason || "").trim();
  const note = String(body.note || "").trim();

  if (!ALLOWED_REASONS.has(reason)) {
    return jsonError("Invalid rejection reason", 400);
  }

  const existing = await sql`
    SELECT id::text, status::text
    FROM gtk_ai_candidates
    WHERE id = ${id}
    LIMIT 1
  `;

  if (existing.length === 0) {
    return jsonError("Candidate not found", 404);
  }

  const oldStatus = existing[0].status as string;

  await sql`
    UPDATE gtk_ai_candidates
    SET
      status = 'rejected',
      rejection_reason = ${reason},
      rejection_note = ${note || null},
      reviewed_at = now(),
      reviewed_by_osm_id = ${session?.user?.id || null},
      reviewed_by_name = ${session?.user?.displayName || null}
    WHERE id = ${id}
  `;

  await sql`
    INSERT INTO gtk_ai_candidate_events (
      candidate_id,
      event_type,
      old_status,
      new_status,
      actor_osm_id,
      actor_name,
      note,
      payload
    )
    VALUES (
      ${id},
      'rejected',
      ${oldStatus},
      'rejected',
      ${session?.user?.id || null},
      ${session?.user?.displayName || null},
      ${note || null},
      ${JSON.stringify({ reason })}::jsonb
    )
  `;

  return NextResponse.json({
    ok: true,
    id,
    status: "rejected"
  });
}