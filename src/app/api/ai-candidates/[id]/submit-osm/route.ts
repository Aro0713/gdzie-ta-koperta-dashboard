import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  OSM_SESSION_COOKIE,
  decryptSession,
  getOsmConfig,
  isSessionValid
} from "@/lib/osmOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CandidateRow = {
  id: string;
  status: string;
  lat: number;
  lng: number;
  osm_tags: Record<string, string> | null;
};

type SendToOsmResponse = {
  ok: boolean;
  id: string;
  nodeId: string;
  changesetId: string;
  osmUrl: string;
};

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      details
    },
    {
      status
    }
  );
}

function xmlEscape(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function formatCoordinate(value: number) {
  return value.toFixed(7);
}

function formatOsmDate(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function hasWriteApi(scope?: string) {
  return Boolean(scope?.split(/\s+/).includes("write_api"));
}

function normalizeOsmTags(candidateTags: Record<string, string> | null) {
  return {
    ...(candidateTags || {}),
    amenity: "parking_space",
    parking_space: "disabled",
    source: "survey",
    "survey:tool": "GdzieTaKoperta",
    check_date: formatOsmDate()
  };
}

async function osmRequest(
  url: string,
  accessToken: string,
  options: {
    method: "PUT" | "POST" | "GET";
    body?: string;
  }
) {
  const response = await fetch(url, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/xml; charset=UTF-8",
      Accept: "text/plain, application/xml, application/json"
    },
    body: options.body
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `OSM API error ${response.status}: ${text.slice(0, 1200)}`
    );
  }

  return text.trim();
}

function buildChangesetXml(candidateId: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="GdzieTaKoperta">
  <changeset>
    <tag k="created_by" v="GdzieTaKoperta"/>
    <tag k="comment" v="${xmlEscape(
      "GdzieTaKoperta: dodanie koperty wykrytej przez AI i zatwierdzonej przez użytkownika"
    )}"/>
    <tag k="source" v="survey"/>
    <tag k="hashtags" v="#GdzieTaKoperta"/>
    <tag k="gtk:candidate_id" v="${xmlEscape(candidateId)}"/>
  </changeset>
</osm>`;
}

function buildNodeXml(
  changesetId: string,
  lat: number,
  lng: number,
  tags: Record<string, string>
) {
  const tagXml = Object.entries(tags)
    .filter(([key, value]) => key && value !== undefined && value !== null)
    .map(
      ([key, value]) =>
        `    <tag k="${xmlEscape(key)}" v="${xmlEscape(value)}"/>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="GdzieTaKoperta">
  <node changeset="${xmlEscape(changesetId)}" lat="${xmlEscape(
    formatCoordinate(lat)
  )}" lon="${xmlEscape(formatCoordinate(lng))}">
${tagXml}
  </node>
</osm>`;
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const cookieStore = await cookies();
  const rawSession = cookieStore.get(OSM_SESSION_COOKIE)?.value;
  const session = rawSession ? decryptSession(rawSession) : null;

  if (!isSessionValid(session)) {
    return jsonError("User is not authenticated with OpenStreetMap", 401);
  }

  if (!hasWriteApi(session?.scope)) {
    return jsonError("OpenStreetMap session does not include write_api scope", 403);
  }

  const rows = (await sql`
    SELECT
      id::text,
      status::text,
      lat::float,
      lng::float,
      osm_tags
    FROM gtk_ai_candidates
    WHERE id = ${id}
    LIMIT 1
  `) as CandidateRow[];

  if (rows.length === 0) {
    return jsonError("Candidate not found", 404);
  }

  const candidate = rows[0];

  if (
    candidate.status !== "needs_review" &&
    candidate.status !== "accepted"
  ) {
    return jsonError(
      `Candidate cannot be submitted from status: ${candidate.status}`,
      409
    );
  }

  const config = getOsmConfig();
  let changesetId: string | null = null;

  try {
    changesetId = await osmRequest(
      `${config.apiBaseUrl}/changeset/create`,
      session!.accessToken,
      {
        method: "PUT",
        body: buildChangesetXml(candidate.id)
      }
    );

    if (!/^\d+$/.test(changesetId)) {
      throw new Error(`Invalid changeset id returned by OSM: ${changesetId}`);
    }

    const tags = normalizeOsmTags(candidate.osm_tags);

    const nodeId = await osmRequest(
      `${config.apiBaseUrl}/node/create`,
      session!.accessToken,
      {
        method: "PUT",
        body: buildNodeXml(changesetId, candidate.lat, candidate.lng, tags)
      }
    );

    if (!/^\d+$/.test(nodeId)) {
      throw new Error(`Invalid node id returned by OSM: ${nodeId}`);
    }

    await osmRequest(
      `${config.apiBaseUrl}/changeset/${changesetId}/close`,
      session!.accessToken,
      {
        method: "PUT"
      }
    );

    const osmUrl = `https://www.openstreetmap.org/node/${nodeId}`;

    await sql`
      UPDATE gtk_ai_candidates
      SET
        status = 'submitted_to_osm',
        submitted_at = now(),
        submitted_by_osm_id = ${session?.user?.id || null},
        submitted_by_name = ${session?.user?.displayName || null},
        reviewed_at = COALESCE(reviewed_at, now()),
        reviewed_by_osm_id = COALESCE(reviewed_by_osm_id, ${session?.user?.id || null}),
        reviewed_by_name = COALESCE(reviewed_by_name, ${session?.user?.displayName || null}),
        osm_node_id = ${Number(nodeId)},
        osm_changeset_id = ${Number(changesetId)},
        osm_url = ${osmUrl}
      WHERE id = ${candidate.id}
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
        ${candidate.id},
        'submitted_to_osm',
        ${candidate.status},
        'submitted_to_osm',
        ${session?.user?.id || null},
        ${session?.user?.displayName || null},
        'Kandydat AI zatwierdzony i wysłany do OpenStreetMap.',
        ${JSON.stringify({
          nodeId,
          changesetId,
          osmUrl,
          tags
        })}::jsonb
      )
    `;

    const payload: SendToOsmResponse = {
      ok: true,
      id: candidate.id,
      nodeId,
      changesetId,
      osmUrl
    };

    return NextResponse.json(payload);
  } catch (error) {
    if (changesetId) {
      try {
        await osmRequest(
          `${config.apiBaseUrl}/changeset/${changesetId}/close`,
          session!.accessToken,
          {
            method: "PUT"
          }
        );
      } catch {
        // Zwracamy główny błąd.
      }
    }

    const message =
      error instanceof Error ? error.message : "Unknown OSM submit error";

    return jsonError("Failed to submit AI candidate to OSM", 502, {
      message,
      changesetId
    });
  }
}