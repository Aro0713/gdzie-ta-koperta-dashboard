import { sql } from "@/lib/db";
import { deleteImageFromCloudinary } from "@/lib/cloudinary";
import { getOsmConfig } from "@/lib/osmOAuth";

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

export async function cleanupExpiredRejectedPhotos(): Promise<{
  purgedCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let purgedCount = 0;

  try {
    const expiredRows = (await sql`
      SELECT id, metadata
      FROM gtk_osm_submissions
      WHERE
        status = 'rejected'
        AND (metadata->>'photoUrl' IS NOT NULL OR metadata->>'imageUrl' IS NOT NULL)
        AND metadata->>'deletePhotoAfter' IS NOT NULL
        AND (metadata->>'deletePhotoAfter')::timestamptz < NOW()
      LIMIT 5;
    `) as Array<{ id: string; metadata: any }>;

    for (const row of expiredRows) {
      const photoUrl =
        row.metadata?.photoUrl ||
        row.metadata?.imageUrl ||
        row.metadata?.photoPublicId;

      if (photoUrl) {
        try {
          await deleteImageFromCloudinary(photoUrl);
          purgedCount++;

          const updatedMetadata = {
            ...row.metadata,
            photoUrl: null,
            imageUrl: null,
            photoPublicId: null,
            photoPurgedAt: new Date().toISOString(),
          };

          await sql`
            UPDATE gtk_osm_submissions
            SET metadata = ${JSON.stringify(updatedMetadata)}::jsonb
            WHERE id = ${row.id};
          `;
        } catch (err: any) {
          errors.push(`Błąd usuwania zdjęcia dla ${row.id}: ${err.message}`);
        }
      }
    }
  } catch (err: any) {
    errors.push(`Błąd kwerendy wygasłych zdjęć: ${err.message}`);
  }

  return { purgedCount, errors };
}

export async function pushApprovedSpotToOsm(params: {
  accessToken: string;
  lat: number;
  lng: number;
  slotsCount?: string | number;
  notes?: string;
}): Promise<{ nodeId: string; changesetId: string; osmUrl: string }> {
  const config = getOsmConfig();
  const { accessToken, lat, lng, slotsCount } = params;

  // 1. Otwórz Changeset
  const changesetXml = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="GdzieTaKoperta">
  <changeset>
    <tag k="created_by" v="GdzieTaKoperta"/>
    <tag k="comment" v="${xmlEscape(
      "GdzieTaKoperta: zatwierdzone miejsce parkingowe dla osób z niepełnosprawnościami"
    )}"/>
    <tag k="source" v="survey"/>
    <tag k="hashtags" v="#GdzieTaKoperta"/>
  </changeset>
</osm>`;

  const createChangesetRes = await fetch(`${config.apiBaseUrl}/changeset/create`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/xml; charset=UTF-8",
      Accept: "text/plain",
    },
    body: changesetXml,
  });

  const changesetId = (await createChangesetRes.text()).trim();
  if (!createChangesetRes.ok || !/^\d+$/.test(changesetId)) {
    throw new Error(`Błąd tworzenia changesetu OSM: ${changesetId}`);
  }

  try {
    // 2. Utwórz Node
    const capacityDisabled = slotsCount ? String(slotsCount) : "1";
    const nodeXml = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="GdzieTaKoperta">
  <node changeset="${xmlEscape(changesetId)}" lat="${xmlEscape(
      formatCoordinate(lat)
    )}" lon="${xmlEscape(formatCoordinate(lng))}">
    <tag k="amenity" v="parking_space"/>
    <tag k="parking_space" v="disabled"/>
    <tag k="capacity:disabled" v="${xmlEscape(capacityDisabled)}"/>
    <tag k="survey:tool" v="GdzieTaKoperta"/>
    <tag k="source:application" v="GdzieTaKoperta"/>
    <tag k="check_date" v="${xmlEscape(formatOsmDate())}"/>
  </node>
</osm>`;

    const createNodeRes = await fetch(`${config.apiBaseUrl}/node/create`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/xml; charset=UTF-8",
        Accept: "text/plain",
      },
      body: nodeXml,
    });

    const nodeId = (await createNodeRes.text()).trim();
    if (!createNodeRes.ok || !/^\d+$/.test(nodeId)) {
      throw new Error(`Błąd tworzenia węzła w OSM: ${nodeId}`);
    }

    // 3. Zamknij Changeset
    await fetch(`${config.apiBaseUrl}/changeset/${changesetId}/close`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return {
      nodeId,
      changesetId,
      osmUrl: `https://www.openstreetmap.org/node/${nodeId}`,
    };
  } catch (err) {
    // Spróbuj zamknąć changeset awaryjnie
    try {
      await fetch(`${config.apiBaseUrl}/changeset/${changesetId}/close`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {}
    throw err;
  }
}
