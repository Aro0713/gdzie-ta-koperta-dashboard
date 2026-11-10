import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import type { Feature, FeatureCollection, Point } from "geojson";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SnapshotProperties = {
  source?: string;
  sourceStatus?: string;
  isCommunitySpot?: boolean;
  photoUrl?: string | null;
  notes?: string | null;
  objectType?: string;
  osmType?: string;
  osmId?: number | string | null;
  osmUrl?: string | null;
  name?: string | null;
  amenity?: string | null;
  parking?: string | null;
  parkingSpace?: string | null;
  capacity?: string | null;
  capacityDisabled?: string | null;
  access?: string | null;
  wheelchair?: string | null;
  surface?: string | null;
  operator?: string | null;
  areaId?: string;
  areaName?: string;
  syncedAt?: string;
  originalGeometryType?: string | null;
  distanceMeters?: number;
  tags?: Record<string, string>;
  externalId?: string | null;
  confidenceScore?: number;
  sourcesProvenance?: any[];
  sourceType?: string | null;
  authority?: string | null;
  lastVerifiedAt?: string | null;
};

type SnapshotFeature = Feature<Point, SnapshotProperties>;
type SnapshotCollection = FeatureCollection<Point, SnapshotProperties>;

type SnapshotMetadata = {
  generatedAt?: string;
  country?: string;
  strategy?: string;
  count?: number;
  exactDisabledParkingSpaces?: number;
  parkingsWithDisabledCapacity?: number;
};

type GtkSubmissionRow = {
  id: string;
  source_type: string | null;
  local_spot_id: string | null;
  submitted_by_osm_id: number | null;
  submitted_by_name: string | null;
  osm_type: string | null;
  osm_id: number | string | null;
  osm_changeset_id: number | string | null;
  osm_url: string | null;
  lat: number | string | null;
  lng: number | string | null;
  metadata?: any;
  submitted_at: string | null;
  status: string | null;
  external_id?: string | null;
  confidence_score?: number | null;
  sources_provenance?: unknown;
  last_verified_at?: string | null;
};

let cachedSnapshot: SnapshotCollection | null = null;
let cachedSnapshotMetadata: SnapshotMetadata | null = null;

const MAX_RADIUS_METERS = 5000;

function parseCoordinate(value: string | null, name: string) {
  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${name}`);
  }

  return parsed;
}

function clampRadius(value: string | null) {
  const parsed = value ? Number(value) : MAX_RADIUS_METERS;

  if (!Number.isFinite(parsed)) {
    return MAX_RADIUS_METERS;
  }

  return Math.min(Math.max(Math.round(parsed), 100), MAX_RADIUS_METERS);
}

function isValidLatLng(lat: number, lng: number) {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function haversineMeters(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
) {
  const earthRadius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;

  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return Math.round(
    earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

function jsonError(message: string, status = 400) {
  return NextResponse.json(
    {
      error: message
    },
    {
      status
    }
  );
}

function getSnapshotPath() {
  return path.join(process.cwd(), "public", "data", "disabled-parking.geojson");
}

function getMetadataPath() {
  return path.join(
    process.cwd(),
    "public",
    "data",
    "disabled-parking-metadata.json"
  );
}

async function loadSnapshot() {
  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  const filePath = getSnapshotPath();
  const raw = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw) as SnapshotCollection;

  if (
    !parsed ||
    parsed.type !== "FeatureCollection" ||
    !Array.isArray(parsed.features)
  ) {
    throw new Error("Invalid disabled-parking.geojson snapshot");
  }

  cachedSnapshot = parsed;

  return parsed;
}

async function loadSnapshotMetadata() {
  if (cachedSnapshotMetadata) {
    return cachedSnapshotMetadata;
  }

  try {
    const raw = await readFile(getMetadataPath(), "utf-8");
    cachedSnapshotMetadata = JSON.parse(raw) as SnapshotMetadata;
    return cachedSnapshotMetadata;
  } catch {
    cachedSnapshotMetadata = {};
    return cachedSnapshotMetadata;
  }
}

function getFeatureLatLng(feature: SnapshotFeature) {
  if (
    feature.geometry?.type !== "Point" ||
    !Array.isArray(feature.geometry.coordinates)
  ) {
    return null;
  }

  const [lng, lat] = feature.geometry.coordinates;

  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !isValidLatLng(lat, lng)
  ) {
    return null;
  }

  return {
    lat,
    lng
  };
}

function withDistance(
  feature: SnapshotFeature,
  userLat: number,
  userLng: number
): SnapshotFeature | null {
  const position = getFeatureLatLng(feature);

  if (!position) {
    return null;
  }

  const distanceMeters = haversineMeters(
    userLat,
    userLng,
    position.lat,
    position.lng
  );

  return {
    ...feature,
    properties: {
      ...(feature.properties || {}),
      source: feature.properties?.source || "openstreetmap",
      sourceStatus: feature.properties?.sourceStatus || "osm_snapshot",
      distanceMeters
    }
  };
}

function countByType(features: SnapshotFeature[]) {
  const exactDisabledParkingSpaces = features.filter(
    (feature) => feature.properties?.objectType === "disabled_parking_space"
  ).length;

  const parkingsWithDisabledCapacity = features.filter(
    (feature) =>
      feature.properties?.objectType === "parking_with_disabled_capacity"
  ).length;

  return {
    exactDisabledParkingSpaces,
    parkingsWithDisabledCapacity
  };
}

const DEFINITELY_NON_PUBLIC_ACCESS_VALUES = new Set([
  "private",
  "no",
  "military",
  "emergency",
  "delivery",
  "residents",
  "permit"
]);

function normalizeTagValue(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return normalized || null;
}

function getFeatureAccessValue(feature: SnapshotFeature) {
  const tags = feature.properties?.tags || {};

  return (
    normalizeTagValue(feature.properties?.access) ||
    normalizeTagValue(tags.access) ||
    normalizeTagValue(tags.vehicle) ||
    normalizeTagValue(tags.motor_vehicle) ||
    normalizeTagValue(tags.foot)
  );
}

function isPubliclyDisplayableFeature(feature: SnapshotFeature) {
  const access = getFeatureAccessValue(feature);

  if (!access) {
    return true;
  }

  return !DEFINITELY_NON_PUBLIC_ACCESS_VALUES.has(access);
}

function getFeatureAreaId(feature: SnapshotFeature) {
  const areaId = feature.properties?.areaId;

  if (!areaId) {
    return null;
  }

  return String(areaId);
}

function filterDisplayableFeatures(features: SnapshotFeature[]) {
  const publicFeatures = features.filter(isPubliclyDisplayableFeature);

  const areasWithExactDisabledSpaces = new Set<string>();

  for (const feature of publicFeatures) {
    if (feature.properties?.objectType !== "disabled_parking_space") {
      continue;
    }

    const areaId = getFeatureAreaId(feature);

    if (areaId) {
      areasWithExactDisabledSpaces.add(areaId);
    }
  }

  return publicFeatures.filter((feature) => {
    if (feature.properties?.objectType !== "parking_with_disabled_capacity") {
      return true;
    }

    const areaId = getFeatureAreaId(feature);

    if (!areaId) {
      return true;
    }

    return !areasWithExactDisabledSpaces.has(areaId);
  });
}

function isGtkFeature(feature: SnapshotFeature) {
  const tags = feature.properties?.tags || {};

  const candidates = [
    tags["survey:tool"],
    tags["source:application"],
    tags["created_by"],
    tags["created_by:app"],
    tags["source"],
    feature.properties?.source,
    feature.properties?.sourceStatus
  ];

  return candidates.some((value) => {
    return (
      typeof value === "string" &&
      /gdzie\s*ta\s*koperta|gdzietakoperta|gtk/i.test(value)
    );
  });
}

function hasValidPointGeometry(feature: SnapshotFeature) {
  return Boolean(getFeatureLatLng(feature));
}

function formatDateOnly(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function gtkSubmissionToFeature(row: GtkSubmissionRow): SnapshotFeature | null {
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  const rawOsmId = row.osm_id !== null && row.osm_id !== undefined ? Number(row.osm_id) : null;
  const syntheticId = Math.abs(
    (row.id || "gtk").split("").reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
  );
  const osmId = rawOsmId !== null && Number.isFinite(rawOsmId) ? rawOsmId : syntheticId;
  const osmType = String(row.osm_type || "node");

  if (!isValidLatLng(lat, lng)) {
    return null;
  }

  const osmUrl =
    row.osm_url || (rawOsmId ? `https://www.openstreetmap.org/${osmType}/${osmId}` : null);
  const checkDate = formatDateOnly(row.submitted_at);
  const meta = row.metadata || {};

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [lng, lat]
    },
    properties: {
      source: "gdzietakoperta",
      sourceStatus: row.status === "submitted_to_osm" ? "gtk_osm_submissions" : "community_verified",
      isCommunitySpot: true,
      photoUrl: meta.photoUrl || null,
      notes: meta.notes || null,
      objectType: "disabled_parking_space",
      osmType,
      osmId,
      osmUrl,
      name: meta.address || null,
      amenity: "parking_space",
      parking: null,
      parkingSpace: "disabled",
      capacity: null,
      capacityDisabled: meta.slotsCount ? String(meta.slotsCount) : "1",
      access: null,
      wheelchair: null,
      surface: null,
      operator: null,
      areaId: undefined,
      areaName: undefined,
      syncedAt: row.submitted_at || undefined,
      originalGeometryType: "Point",
      externalId: row.external_id || null,
      confidenceScore: typeof row.confidence_score === "number" ? row.confidence_score : 85,
      sourcesProvenance: Array.isArray(row.sources_provenance) ? row.sources_provenance : [],
      sourceType: row.source_type || null,
      authority: meta.authority || null,
      lastVerifiedAt: row.last_verified_at || row.submitted_at || null,
      tags: {
        amenity: "parking_space",
        parking_space: "disabled",
        ...(checkDate ? { check_date: checkDate } : {}),
        "source:registry": "GdzieTaKoperta",
        "gtk:submitted_by": row.submitted_by_name || "",
        "gtk:source_type": row.source_type || "manual",
        ...(row.external_id ? { "gtk:external_id": row.external_id } : {}),
        ...(row.confidence_score ? { "gtk:confidence": String(row.confidence_score) } : {}),
        ...(meta.photoUrl ? { "photo:url": meta.photoUrl } : {}),
        ...(meta.notes ? { description: meta.notes } : {})
      }
    }
  };
}

async function fetchGtkSubmissionFeaturesFromDb() {
  try {
    const rows = (await sql`
      SELECT
        id::text,
        source_type,
        local_spot_id,
        submitted_by_osm_id,
        submitted_by_name,
        osm_type,
        osm_id::bigint,
        osm_changeset_id::bigint,
        osm_url,
        lat::float,
        lng::float,
        metadata,
        submitted_at::text,
        status,
        external_id,
        confidence_score,
        sources_provenance,
        last_verified_at::text
      FROM gtk_osm_submissions
      WHERE
        status IN ('submitted_to_osm', 'approved')
        AND lat IS NOT NULL
        AND lng IS NOT NULL
      ORDER BY submitted_at DESC
    `) as GtkSubmissionRow[];

    return rows
      .map(gtkSubmissionToFeature)
      .filter((feature): feature is SnapshotFeature => Boolean(feature));
  } catch (error) {
    console.error("[api/osm/parking] Failed to load GTK registry features", {
      error
    });

    return [];
  }
}

const getCachedGtkSubmissionFeatures = unstable_cache(
  fetchGtkSubmissionFeaturesFromDb,
  ["gtk-osm-submissions-features"],
  {
    revalidate: 60,
    tags: ["gtk_osm_submissions"]
  }
);

async function loadGtkSubmissionFeatures() {
  return getCachedGtkSubmissionFeatures();
}

async function fetchSuppressedSpotKeysFromDb(): Promise<string[]> {
  try {
    const rows = (await sql`
      SELECT
        osm_id::text,
        metadata->>'spotId' as target_spot_id,
        lat::float,
        lng::float
      FROM gtk_osm_submissions
      WHERE status IN ('removed', 'confirmed_removed')
    `) as Array<{
      osm_id: string | null;
      target_spot_id: string | null;
      lat: number | null;
      lng: number | null;
    }>;

    const keys: string[] = [];
    for (const r of rows) {
      if (r.osm_id) keys.push(`id:${r.osm_id}`);
      if (r.target_spot_id) keys.push(`id:${r.target_spot_id}`);
      if (r.lat && r.lng) {
        keys.push(`geo:${r.lat.toFixed(4)}:${r.lng.toFixed(4)}`);
      }
    }
    return keys;
  } catch (error) {
    console.error("[api/osm/parking] Failed to load suppressed spots", error);
    return [];
  }
}

const getCachedSuppressedSpotKeys = unstable_cache(
  fetchSuppressedSpotKeysFromDb,
  ["gtk-suppressed-spot-keys"],
  {
    revalidate: 60,
    tags: ["gtk_osm_submissions"]
  }
);

async function loadSuppressedSpotKeys() {
  return getCachedSuppressedSpotKeys();
}

async function fetchSpotConfirmationsFromDb(): Promise<Record<string, number>> {
  try {
    const rows = (await sql`
      SELECT spot_id, confirmations_count
      FROM gtk_spot_confirmations;
    `) as Array<{ spot_id: string; confirmations_count: number }>;

    const map: Record<string, number> = {};
    for (const r of rows) {
      if (r.spot_id) {
        map[r.spot_id] = Number(r.confirmations_count) || 1;
      }
    }
    return map;
  } catch (error) {
    return {};
  }
}

const getCachedSpotConfirmations = unstable_cache(
  fetchSpotConfirmationsFromDb,
  ["gtk-spot-confirmations-map"],
  {
    revalidate: 30,
    tags: ["gtk_osm_submissions", "spots"]
  }
);

async function loadSpotConfirmations() {
  return getCachedSpotConfirmations();
}

function getDedupeKey(feature: SnapshotFeature) {
  const properties = feature.properties || {};
  const osmType = properties.osmType ? String(properties.osmType) : null;
  const osmId =
    properties.osmId !== undefined && properties.osmId !== null
      ? String(properties.osmId)
      : null;

  if (osmType && osmId) {
    return `${osmType}:${osmId}`;
  }

  const position = getFeatureLatLng(feature);

  if (position) {
    return `point:${position.lat.toFixed(7)}:${position.lng.toFixed(7)}`;
  }

  return JSON.stringify(feature.geometry);
}

function isFeatureSuppressed(
  feature: SnapshotFeature,
  suppressedKeys: Set<string>
) {
  if (suppressedKeys.size === 0) return false;
  const props = feature.properties || {};
  const osmId =
    props.osmId !== undefined && props.osmId !== null
      ? String(props.osmId)
      : null;

  if (
    osmId &&
    (suppressedKeys.has(`id:${osmId}`) || suppressedKeys.has(osmId))
  ) {
    return true;
  }

  const pos = getFeatureLatLng(feature);
  if (pos) {
    const geoKey = `geo:${pos.lat.toFixed(4)}:${pos.lng.toFixed(4)}`;
    const coordKey = `id:${pos.lat}-${pos.lng}`;
    if (suppressedKeys.has(geoKey) || suppressedKeys.has(coordKey)) {
      return true;
    }
  }

  return false;
}

function mergeSnapshotAndGtkRegistryFeatures(
  snapshotFeatures: SnapshotFeature[],
  gtkRegistryFeatures: SnapshotFeature[],
  suppressedKeys: Set<string>
) {
  const byKey = new Map<string, SnapshotFeature>();

  for (const feature of snapshotFeatures) {
    if (isFeatureSuppressed(feature, suppressedKeys)) continue;
    byKey.set(getDedupeKey(feature), feature);
  }

  for (const feature of gtkRegistryFeatures) {
    if (isFeatureSuppressed(feature, suppressedKeys)) continue;
    byKey.set(getDedupeKey(feature), feature);
  }

  return Array.from(byKey.values());
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  try {
    const scope = searchParams.get("scope");
    const sourceFilter = searchParams.get("source");

    const [snapshot, snapshotMetadata, gtkRegistryFeatures, suppressedKeysList, confirmationsMap] = await Promise.all([
      loadSnapshot(),
      loadSnapshotMetadata(),
      loadGtkSubmissionFeatures(),
      loadSuppressedSpotKeys(),
      loadSpotConfirmations()
    ]);

    const suppressedKeys = new Set(suppressedKeysList);

    const mergedFeatures = mergeSnapshotAndGtkRegistryFeatures(
      snapshot.features,
      gtkRegistryFeatures,
      suppressedKeys
    );

    const baseDisplayableFeatures = filterDisplayableFeatures(mergedFeatures);

    // Wzbogacenie punktów (zarówno OSM, jak i GTK) o aktualne potwierdzenia kierowców bez tworzenia duplikatów
    const displayableFeatures = baseDisplayableFeatures.map((f) => {
      const p = f.properties || {};
      const osmId = p.osmId !== null && p.osmId !== undefined ? String(p.osmId) : null;
      const spotId = osmId || (f as any).id || (p as any).externalId || "";
      const count =
        (osmId && confirmationsMap[osmId]) ||
        (spotId && confirmationsMap[spotId]) ||
        (osmId && confirmationsMap[`osm_${osmId}`]) ||
        0;

      if (count > 0) {
        return {
          ...f,
          properties: {
            ...p,
            verifiedCount: count,
            confirmations: count
          }
        };
      }
      return f;
    });

    if (scope === "country") {
      const countryFeatures = displayableFeatures
        .filter((feature): feature is SnapshotFeature => {
          if (!hasValidPointGeometry(feature)) {
            return false;
          }

          if (sourceFilter === "gtk") {
            return isGtkFeature(feature);
          }

          return true;
        })
        .sort((a, b) => {
          const firstType =
            a.properties?.objectType === "disabled_parking_space" ? 0 : 1;
          const secondType =
            b.properties?.objectType === "disabled_parking_space" ? 0 : 1;

          if (firstType !== secondType) {
            return firstType - secondType;
          }

          const firstId = String(a.properties?.osmId || "");
          const secondId = String(b.properties?.osmId || "");

          return firstId.localeCompare(secondId);
        });

      const typeCounts = countByType(countryFeatures);

      return NextResponse.json(
        {
          type: "FeatureCollection",
          metadata: {
            source:
              "OpenStreetMap snapshot generated via OSMnx/Overpass + GTK registry",
            sourceStatus:
              sourceFilter === "gtk"
                ? "gtk_osm_snapshot_and_registry"
                : "osm_snapshot_and_gtk_registry",
            mode:
              sourceFilter === "gtk"
                ? "country_gtk_snapshot_and_registry"
                : "country_snapshot_and_registry",
            generatedAt: snapshotMetadata.generatedAt || null,
            country: snapshotMetadata.country || "Poland",
            strategy: snapshotMetadata.strategy || "voivodeship-snapshot",
            count: countryFeatures.length,
            snapshotCount: snapshotMetadata.count ?? snapshot.features.length,
            gtkRegistryCount: gtkRegistryFeatures.length,
            exactDisabledParkingSpaces:
              typeCounts.exactDisabledParkingSpaces,
            parkingsWithDisabledCapacity:
              typeCounts.parkingsWithDisabledCapacity,
            snapshotTotals: {
              exactDisabledParkingSpaces:
                snapshotMetadata.exactDisabledParkingSpaces ?? null,
              parkingsWithDisabledCapacity:
                snapshotMetadata.parkingsWithDisabledCapacity ?? null
            }
          },
          features: countryFeatures
        },
        {
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const lat = parseCoordinate(searchParams.get("lat"), "lat");
    const lng = parseCoordinate(searchParams.get("lng"), "lng");
    const radius = clampRadius(searchParams.get("radius"));

    if (!isValidLatLng(lat, lng)) {
      return jsonError("Invalid latitude or longitude range", 400);
    }

    const features = displayableFeatures
      .map((feature) => withDistance(feature, lat, lng))
      .filter((feature): feature is SnapshotFeature => {
        return Boolean(
          feature &&
            typeof feature.properties?.distanceMeters === "number" &&
            feature.properties.distanceMeters <= radius
        );
      })
      .sort((a, b) => {
        const first = a.properties?.distanceMeters ?? Number.MAX_SAFE_INTEGER;
        const second = b.properties?.distanceMeters ?? Number.MAX_SAFE_INTEGER;

        return first - second;
      });

    const typeCounts = countByType(features);

    return NextResponse.json(
      {
        type: "FeatureCollection",
        metadata: {
          source:
            "OpenStreetMap snapshot generated via OSMnx/Overpass + GTK registry",
          sourceStatus: "osm_snapshot_and_gtk_registry",
          mode: "static_snapshot_filter_with_gtk_registry",
          generatedAt: snapshotMetadata.generatedAt || null,
          country: snapshotMetadata.country || "Poland",
          strategy: snapshotMetadata.strategy || "voivodeship-snapshot",
          center: {
            lat,
            lng
          },
          radiusMeters: radius,
          count: features.length,
          snapshotCount: snapshotMetadata.count ?? snapshot.features.length,
          gtkRegistryCount: gtkRegistryFeatures.length,
          exactDisabledParkingSpaces:
            typeCounts.exactDisabledParkingSpaces,
          parkingsWithDisabledCapacity:
            typeCounts.parkingsWithDisabledCapacity,
          snapshotTotals: {
            exactDisabledParkingSpaces:
              snapshotMetadata.exactDisabledParkingSpaces ?? null,
            parkingsWithDisabledCapacity:
              snapshotMetadata.parkingsWithDisabledCapacity ?? null
          }
        },
        features
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown snapshot endpoint error";

    return jsonError(message, 500);
  }
}