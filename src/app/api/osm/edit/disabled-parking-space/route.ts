import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  OSM_SESSION_COOKIE,
  decryptSession,
  getOsmConfig,
  isSessionValid,
  getBearerSessionFromAuthorization
} from "@/lib/osmOAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateDisabledParkingBody = {
  lat?: number;
  lng?: number;
  localSpotId?: string;
  source?: string;
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

function isValidLatLng(lat: number, lng: number) {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
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

function buildChangesetXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="GdzieTaKoperta">
  <changeset>
    <tag k="created_by" v="GdzieTaKoperta"/>
    <tag k="comment" v="${xmlEscape(
      "GdzieTaKoperta: dodanie miejsca parkingowego dla osób z niepełnosprawnościami"
    )}"/>
    <tag k="source" v="survey"/>
    <tag k="hashtags" v="#GdzieTaKoperta"/>
  </changeset>
</osm>`;
}

function buildNodeXml(changesetId: string, lat: number, lng: number) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="GdzieTaKoperta">
  <node changeset="${xmlEscape(changesetId)}" lat="${xmlEscape(
    formatCoordinate(lat)
  )}" lon="${xmlEscape(formatCoordinate(lng))}">
    <tag k="amenity" v="parking_space"/>
    <tag k="parking_space" v="disabled"/>
    <tag k="survey:tool" v="GdzieTaKoperta"/>
    <tag k="source:application" v="GdzieTaKoperta"/>
    <tag k="check_date" v="${xmlEscape(formatOsmDate())}"/>
  </node>
</osm>`;
}

async function registerManualSubmissionInGtk(params: {
  localSpotId?: string;
  osmUserId?: number | null;
  osmDisplayName?: string | null;
  nodeId: string;
  changesetId: string;
  osmUrl: string;
  lat: number;
  lng: number;
  source?: string;
}) {
  await sql`
    INSERT INTO gtk_osm_submissions (
      source_type,
      local_spot_id,
      submitted_by_osm_id,
      submitted_by_name,
      osm_type,
      osm_id,
      osm_changeset_id,
      osm_url,
      lat,
      lng,
      status,
      metadata
    )
    VALUES (
      'manual',
      ${params.localSpotId || null},
      ${params.osmUserId || null},
      ${params.osmDisplayName || null},
      'node',
      ${Number(params.nodeId)},
      ${Number(params.changesetId)},
      ${params.osmUrl},
      ${params.lat},
      ${params.lng},
      'submitted_to_osm',
      ${JSON.stringify({
        source: params.source || "manual_map_add",
        app: "GdzieTaKoperta"
      })}::jsonb
    )
    ON CONFLICT (osm_type, osm_id)
    DO UPDATE SET
      source_type = EXCLUDED.source_type,
      local_spot_id = COALESCE(gtk_osm_submissions.local_spot_id, EXCLUDED.local_spot_id),
      submitted_by_osm_id = COALESCE(gtk_osm_submissions.submitted_by_osm_id, EXCLUDED.submitted_by_osm_id),
      submitted_by_name = COALESCE(gtk_osm_submissions.submitted_by_name, EXCLUDED.submitted_by_name),
      osm_changeset_id = EXCLUDED.osm_changeset_id,
      osm_url = EXCLUDED.osm_url,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      status = EXCLUDED.status,
      metadata = gtk_osm_submissions.metadata || EXCLUDED.metadata,
      updated_at = now()
  `;
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const rawCookieSession = cookieStore.get(OSM_SESSION_COOKIE)?.value;
  const rawBearerSession = getBearerSessionFromAuthorization(
    request.headers.get("Authorization")
  );
  const rawSession = rawBearerSession || rawCookieSession;
  const session = rawSession ? decryptSession(rawSession) : null;

  if (!isSessionValid(session)) {
    return jsonError("User is not authenticated with OpenStreetMap", 401);
  }

  if (!hasWriteApi(session?.scope)) {
    return jsonError("OpenStreetMap session does not include write_api scope", 403);
  }

  let body: CreateDisabledParkingBody;

  try {
    body = (await request.json()) as CreateDisabledParkingBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isValidLatLng(lat, lng)) {
    return jsonError("Invalid lat/lng", 400);
  }

  const config = getOsmConfig();
  let changesetId: string | null = null;

  try {
    changesetId = await osmRequest(
      `${config.apiBaseUrl}/changeset/create`,
      session!.accessToken,
      {
        method: "PUT",
        body: buildChangesetXml()
      }
    );

    if (!/^\d+$/.test(changesetId)) {
      throw new Error(`Invalid changeset id returned by OSM: ${changesetId}`);
    }

    const nodeId = await osmRequest(
      `${config.apiBaseUrl}/node/create`,
      session!.accessToken,
      {
        method: "PUT",
        body: buildNodeXml(changesetId, lat, lng)
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
    let registrySaved = true;
    let registryError: string | null = null;

    try {
      await registerManualSubmissionInGtk({
        localSpotId: body.localSpotId,
        osmUserId: session?.user?.id || null,
        osmDisplayName: session?.user?.displayName || null,
        nodeId,
        changesetId,
        osmUrl,
        lat,
        lng,
        source: body.source
      });
    } catch (error) {
      registrySaved = false;
      registryError =
        error instanceof Error ? error.message : "Unknown GTK registry error";

      console.error("[api/osm/edit] Failed to register GTK submission", {
        nodeId,
        changesetId,
        registryError
      });
    }

    return NextResponse.json({
      ok: true,
      localSpotId: body.localSpotId || null,
      nodeId,
      changesetId,
      osmUrl,
      registrySaved,
      registryError,
      message:
        "Koperta została wysłana do OpenStreetMap jako edycja zalogowanego użytkownika."
    });
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
        // Jeżeli zamknięcie changesetu się nie uda, zwracamy główny błąd.
      }
    }

    const message =
      error instanceof Error ? error.message : "Unknown OSM edit error";

    return jsonError("Failed to create disabled parking space in OSM", 502, {
      message,
      changesetId
    });
  }
}