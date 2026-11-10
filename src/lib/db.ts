import { neon } from "@neondatabase/serverless";

/**
 * Pojedynczy wpis w łańcuchu źródeł potwierdzających daną kopertę parkingową.
 * Pozwala śledzić fuzję danych przestrzennych (Spatial Conflation) z wielu rejestrów.
 */
export interface SourceProvenanceItem {
  /** Typ źródła: np. 'community_pwa', 'gov_wfs', 'osm', 'ai_scan', 'um_warszawa' */
  sourceType: string;
  /** Zewnętrzny identyfikator rekordu w rejestrze źródłowym */
  externalId?: string | null;
  /** Organ lub dostawca danych: np. 'ZDM Warszawa', 'ZDiZ Gdańsk', 'OpenStreetMap' */
  authority?: string | null;
  /** Odległość w metrach między pozycją tego źródła a pozycją bazową punktu */
  distanceDiffMeters?: number | null;
  /** Data synchronizacji ze źródłem */
  syncedAt: string;
  /** Pewność / waga źródła (0 - 100) */
  confidence?: number;
  /** Dodatkowe metadane źródłowe */
  metadata?: Record<string, unknown>;
}

/**
 * Model bazy danych tabeli `gtk_osm_submissions` ze wsparciem PostGIS
 * oraz wieloźródłowej fuzji danych przestrzennych.
 */
export interface GtkOsmSubmission {
  id: string;
  source_type: string;
  local_spot_id?: string | null;
  ai_candidate_id?: string | null;
  submitted_by_osm_id?: string | null;
  submitted_by_name?: string | null;
  osm_type?: string | null;
  osm_id?: number | string | null;
  osm_changeset_id?: number | string | null;
  osm_url?: string | null;
  lat: number;
  lng: number;
  status: string;
  metadata?: Record<string, unknown>;
  submitted_at: string;
  created_at: string;

  // Pola fuzji przestrzennej i jakości danych (Migration 002)
  geom?: unknown; // PostGIS geography(Point, 4326)
  external_id?: string | null;
  confidence_score: number;
  sources_provenance: SourceProvenanceItem[];
  last_verified_at: string;
}

/** Alias pod wsteczną i semantyczną zgodność */
export type ParkingSubmission = GtkOsmSubmission;

function getDatabaseUrl(): string {
  const rawUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED;

  if (!rawUrl) {
    throw new Error(
      "Brak zmiennej DATABASE_URL w konfiguracji Vercel. Sprawdź Settings -> Environment Variables."
    );
  }

  // Usuwamy ewentualne cudzysłowy i spacje na wypadek wklejenia w panelu Vercel w formacie "url"
  return rawUrl.trim().replace(/^["']|["']$/g, "").replace(/\r?\n/g, "");
}

export const sql = neon(getDatabaseUrl());

let schemaEnsured = false;
let schemaEnsuringPromise: Promise<void> | null = null;

export async function ensureDatabaseSchema(): Promise<void> {
  if (schemaEnsured) return;
  if (schemaEnsuringPromise) return schemaEnsuringPromise;

  schemaEnsuringPromise = (async () => {
    try {
      await sql`CREATE EXTENSION IF NOT EXISTS postgis;`.catch(() => {});
      await sql`
        CREATE TABLE IF NOT EXISTS gtk_osm_submissions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          source_type TEXT NOT NULL DEFAULT 'community_pwa',
          local_spot_id TEXT,
          ai_candidate_id TEXT,
          submitted_by_osm_id TEXT,
          submitted_by_name TEXT,
          osm_type TEXT,
          osm_id BIGINT,
          osm_changeset_id BIGINT,
          osm_url TEXT,
          lat DOUBLE PRECISION NOT NULL,
          lng DOUBLE PRECISION NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          geom GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED,
          external_id TEXT,
          confidence_score SMALLINT NOT NULL DEFAULT 50,
          sources_provenance JSONB NOT NULL DEFAULT '[]'::jsonb,
          last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `;
      // Idempotentne uzupełnienie kolumn dla istniejących instancji bazy
      await sql`
        ALTER TABLE gtk_osm_submissions
          ADD COLUMN IF NOT EXISTS geom GEOGRAPHY(Point, 4326) 
            GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED,
          ADD COLUMN IF NOT EXISTS external_id TEXT,
          ADD COLUMN IF NOT EXISTS confidence_score SMALLINT NOT NULL DEFAULT 50,
          ADD COLUMN IF NOT EXISTS sources_provenance JSONB NOT NULL DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      `.catch(() => {});

      // Indeksy wydajnościowe i przestrzenne
      await sql`
        CREATE INDEX IF NOT EXISTS idx_gtk_submissions_status_coords 
        ON gtk_osm_submissions (status, lat, lng);
      `.catch(() => {});
      await sql`
        CREATE INDEX IF NOT EXISTS idx_gtk_submissions_geom 
        ON gtk_osm_submissions USING GIST (geom);
      `.catch(() => {});
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_gtk_submissions_external_id 
        ON gtk_osm_submissions (external_id) WHERE external_id IS NOT NULL;
      `.catch(() => {});
      await sql`
        CREATE INDEX IF NOT EXISTS idx_gtk_submissions_confidence 
        ON gtk_osm_submissions (confidence_score);
      `.catch(() => {});

      await sql`
        CREATE TABLE IF NOT EXISTS gtk_spot_confirmations (
          spot_id TEXT PRIMARY KEY,
          confirmations_count INT NOT NULL DEFAULT 1,
          last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `.catch(() => {});

      schemaEnsured = true;
    } catch (err: any) {
      console.warn("Schema init notice:", err?.message || err);
    } finally {
      schemaEnsuringPromise = null;
    }
  })();

  return schemaEnsuringPromise;
}
