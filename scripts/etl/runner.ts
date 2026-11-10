import type { EtlAdapter, NormalizedGovSpot, SpatialConflationResult } from "./types";
import { gdanskAdapter } from "./adapters/gdansk";
import { wroclawAdapter } from "./adapters/wroclaw";
import { poznanAdapter } from "./adapters/poznan";
import { gdyniaAdapter } from "./adapters/gdynia";

const CONFLATION_BUFFER_METERS = 10.0;

let dbPromise: Promise<typeof import("../../src/lib/db")> | null = null;

async function getDb() {
  if (!dbPromise) {
    if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
      try {
        process.loadEnvFile?.(".env.local");
      } catch {}
      try {
        process.loadEnvFile?.(".env");
      } catch {}
    }
    dbPromise = import("../../src/lib/db");
  }
  return dbPromise;
}

interface ExistingSpotCandidate {
  id: string;
  external_id: string | null;
  status: string | null;
  confidence_score: number;
  sources_provenance: Array<{
    sourceType?: string;
    externalId?: string | null;
    authority?: string;
    distanceDiffMeters?: number;
    syncedAt?: string;
    metadata?: Record<string, unknown>;
  }>;
  metadata: Record<string, unknown> | null;
  distance_diff: number;
}

/**
 * Wykonuje Spatial Conflation dla pojedynczego punktu w PostGIS:
 * 1. Szuka istniejącego punktu w buforze 10m (ST_DWithin) lub o tym samym external_id
 * 2. Jeśli istnieje: aktualizuje wiersz (fuzja źródeł, podbicie confidence_score, auto-approval)
 * 3. Jeśli nie istnieje: wykonuje INSERT z klauzulą ON CONFLICT dla pełnej idempotencji
 */
async function conflateSpot(spot: NormalizedGovSpot): Promise<SpatialConflationResult> {
  const { sql } = await getDb();
  const incomingLng = spot.lng;
  const incomingLat = spot.lat;

  // 1. Sprawdź czy w promieniu 10m istnieje już rekord w PostGIS
  const candidates = (await sql`
    SELECT
      id,
      external_id,
      status,
      confidence_score,
      sources_provenance,
      metadata,
      ST_Distance(
        geom,
        ST_SetSRID(ST_MakePoint(${incomingLng}, ${incomingLat}), 4326)::geography
      )::float AS distance_diff
    FROM gtk_osm_submissions
    WHERE
      (external_id IS NOT NULL AND external_id = ${spot.externalId})
      OR ST_DWithin(
        geom,
        ST_SetSRID(ST_MakePoint(${incomingLng}, ${incomingLat}), 4326)::geography,
        ${CONFLATION_BUFFER_METERS}
      )
    ORDER BY
      CASE WHEN external_id = ${spot.externalId} THEN 0 ELSE 1 END,
      distance_diff ASC
    LIMIT 1;
  `) as ExistingSpotCandidate[];

  const existing = candidates[0];

  if (existing) {
    const distanceDiff = Number(existing.distance_diff || 0);

    // Podbicie wskaźnika wiarygodności:
    // LEAST(100, GREATEST(current_score, incoming_trust) + 10)
    const newScore = Math.min(
      100,
      Math.max(existing.confidence_score || 50, spot.trustScore || 90) + 10
    );

    // Jeśli punkt oczekiwał na weryfikację, potwierdzenie urzędowe wystarcza do zatwierdzenia
    const newStatus =
      existing.status === "pending_verification" || existing.status === "pending"
        ? "approved"
        : existing.status || "approved";

    // Fuzja źródeł w sources_provenance
    const provenanceList = Array.isArray(existing.sources_provenance)
      ? [...existing.sources_provenance]
      : [];

    const existingProvIndex = provenanceList.findIndex(
      (p) => p.externalId === spot.externalId || (p.authority === spot.authority && p.distanceDiffMeters === 0)
    );

    const provenanceEntry = {
      sourceType: spot.sourceType,
      externalId: spot.externalId,
      authority: spot.authority,
      distanceDiffMeters: Math.round(distanceDiff * 10) / 10,
      syncedAt: new Date().toISOString()
    };

    if (existingProvIndex >= 0) {
      provenanceList[existingProvIndex] = provenanceEntry;
    } else {
      provenanceList.push(provenanceEntry);
    }

    // Uzupełnienie brakujących danych w metadata
    const existingMeta = existing.metadata || {};
    const updatedMetadata = {
      ...existingMeta,
      address: existingMeta.address || spot.address || null,
      slotsCount: existingMeta.slotsCount || spot.slotsCount || 1,
      name: existingMeta.name || spot.name || null,
      authority: spot.authority,
      lastConflatedAt: new Date().toISOString()
    };

    await sql`
      UPDATE gtk_osm_submissions
      SET
        external_id = COALESCE(external_id, ${spot.externalId}),
        status = ${newStatus},
        confidence_score = ${newScore},
        sources_provenance = ${JSON.stringify(provenanceList)}::jsonb,
        metadata = ${JSON.stringify(updatedMetadata)}::jsonb,
        last_verified_at = NOW()
      WHERE id = ${existing.id};
    `;

    return {
      action: "updated",
      id: existing.id,
      externalId: spot.externalId,
      distanceDiffMeters: distanceDiff,
      confidenceScore: newScore
    };
  }

  // 2. Brak dopasowania w buforze 10m -> wstaw nowy rekord jako approved
  const initialProvenance = [
    {
      sourceType: spot.sourceType,
      externalId: spot.externalId,
      authority: spot.authority,
      distanceDiffMeters: 0,
      syncedAt: new Date().toISOString()
    }
  ];

  const initialMetadata = {
    address: spot.address || null,
    slotsCount: spot.slotsCount || 1,
    name: spot.name || null,
    authority: spot.authority,
    ...(spot.metadata || {}),
    importedAt: new Date().toISOString()
  };

  const insertResult = (await sql`
    INSERT INTO gtk_osm_submissions (
      id,
      source_type,
      status,
      confidence_score,
      external_id,
      lat,
      lng,
      submitted_at,
      last_verified_at,
      sources_provenance,
      metadata
    ) VALUES (
      gen_random_uuid(),
      ${spot.sourceType},
      'approved',
      ${spot.trustScore},
      ${spot.externalId},
      ${spot.lat},
      ${spot.lng},
      NOW(),
      NOW(),
      ${JSON.stringify(initialProvenance)}::jsonb,
      ${JSON.stringify(initialMetadata)}::jsonb
    )
    ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO UPDATE SET
      confidence_score = LEAST(100, GREATEST(gtk_osm_submissions.confidence_score, EXCLUDED.confidence_score)),
      last_verified_at = NOW(),
      metadata = gtk_osm_submissions.metadata || EXCLUDED.metadata
    RETURNING id, confidence_score;
  `) as Array<{ id: string; confidence_score: number }>;

  return {
    action: "inserted",
    id: insertResult[0]?.id,
    externalId: spot.externalId,
    confidenceScore: insertResult[0]?.confidence_score || spot.trustScore
  };
}

interface RunnerOptions {
  city?: string;
  limit?: number;
}

function parseCliArgs(): RunnerOptions {
  const args = process.argv.slice(2);
  const options: RunnerOptions = {};

  for (const arg of args) {
    if (arg.startsWith("--city=")) {
      options.city = arg.split("=")[1].toLowerCase().trim();
    } else if (arg.startsWith("--limit=")) {
      const num = parseInt(arg.split("=")[1], 10);
      if (Number.isFinite(num) && num > 0) {
        options.limit = num;
      }
    }
  }

  return options;
}

export async function runEtlSync(): Promise<void> {
  const options = parseCliArgs();
  console.log("==================================================");
  console.log("   Gdzie Ta Koperta? - Silnik ETL & Spatial Conflation");
  console.log("==================================================");

  const { ensureDatabaseSchema } = await getDb();
  // Upewnij się, że schemat bazy i rozszerzenie PostGIS są aktywne
  await ensureDatabaseSchema();

  const allAdapters: Record<string, EtlAdapter> = {
    gdansk: gdanskAdapter,
    wroclaw: wroclawAdapter,
    poznan: poznanAdapter,
    gdynia: gdyniaAdapter
  };

  const adaptersToRun: EtlAdapter[] = [];

  if (options.city) {
    const selected = allAdapters[options.city];
    if (!selected) {
      console.error(`Nieznane miasto: "${options.city}". Dostępne: ${Object.keys(allAdapters).join(", ")}`);
      process.exit(1);
    }
    adaptersToRun.push(selected);
  } else {
    adaptersToRun.push(gdanskAdapter, wroclawAdapter, poznanAdapter);
  }

  const globalStats = {
    totalFetched: 0,
    totalInserted: 0,
    totalUpdated: 0,
    errors: 0
  };

  for (const adapter of adaptersToRun) {
    console.log(`\n--- Uruchamianie adaptera: ${adapter.name} (${adapter.authority}) ---`);
    try {
      let spots = await adapter.fetchSpots(options.limit);
      if (options.limit && options.limit > 0) {
        console.log(`[Opcja CLI] Ograniczenie próby do pierwszych ${options.limit} rekordów.`);
        spots = spots.slice(0, options.limit);
      }

      globalStats.totalFetched += spots.length;
      let inserted = 0;
      let updated = 0;

      for (const [index, spot] of spots.entries()) {
        try {
          const res = await conflateSpot(spot);
          if (res.action === "inserted") {
            inserted += 1;
          } else if (res.action === "updated") {
            updated += 1;
            console.log(
              `  [Fuzja 10m] Zaktualizowano istniejący punkt (d=${res.distanceDiffMeters?.toFixed(1)}m, nowe zaufanie=${res.confidenceScore}) dla: ${spot.address || spot.externalId}`
            );
          }

          if ((index + 1) % 10 === 0 || index + 1 === spots.length) {
            process.stdout.write(`  Przetworzono: ${index + 1}/${spots.length} (nowe: ${inserted}, połączone: ${updated})\r`);
          }
        } catch (itemErr) {
          console.error(`  Błąd conflation dla ${spot.externalId}:`, itemErr);
          globalStats.errors += 1;
        }
      }

      console.log(`\n  Koniec adaptera ${adapter.name}: dodano ${inserted}, zaktualizowano ${updated}.`);
      globalStats.totalInserted += inserted;
      globalStats.totalUpdated += updated;
    } catch (adapterErr) {
      console.error(`Błąd działania adaptera ${adapter.name}:`, adapterErr);
      globalStats.errors += 1;
    }
  }

  console.log("\n==================================================");
  console.log("   PODSUMOWANIE SYNCHRONIZACJI ETL");
  console.log("==================================================");
  console.log(`Pobrane rekordy:      ${globalStats.totalFetched}`);
  console.log(`Nowe (wstawione):     ${globalStats.totalInserted}`);
  console.log(`Połączone (fuzja):    ${globalStats.totalUpdated}`);
  console.log(`Błędy:                ${globalStats.errors}`);
  console.log("==================================================\n");
}

if (process.argv[1] && process.argv[1].endsWith("runner.ts")) {
  runEtlSync()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error("Krytyczny błąd silnika ETL:", err);
      process.exit(1);
    });
}
