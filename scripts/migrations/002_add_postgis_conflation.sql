-- Migration 002: Add PostGIS spatial conflation and provenance tracking to gtk_osm_submissions
-- Target: Neon PostgreSQL with PostGIS

-- 1. Ensure PostGIS is enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Add conflation columns to gtk_osm_submissions
ALTER TABLE gtk_osm_submissions
  ADD COLUMN IF NOT EXISTS geom GEOGRAPHY(Point, 4326) 
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED,
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS confidence_score SMALLINT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS sources_provenance JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3. Add constraint for confidence_score range (0-100) if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_gtk_submissions_confidence_range'
  ) THEN
    ALTER TABLE gtk_osm_submissions
      ADD CONSTRAINT chk_gtk_submissions_confidence_range
      CHECK (confidence_score >= 0 AND confidence_score <= 100);
  END IF;
END $$;

-- 4. Spatial GiST Index for fast proximity searches (ST_DWithin)
CREATE INDEX IF NOT EXISTS idx_gtk_submissions_geom 
  ON gtk_osm_submissions USING GIST (geom);

-- 5. Partial Unique Index on external_id to prevent duplicates on external data sync
CREATE UNIQUE INDEX IF NOT EXISTS uq_gtk_submissions_external_id 
  ON gtk_osm_submissions (external_id) 
  WHERE external_id IS NOT NULL;

-- 6. B-Tree Index on confidence_score for quality filtering
CREATE INDEX IF NOT EXISTS idx_gtk_submissions_confidence 
  ON gtk_osm_submissions (confidence_score);

-- 7. Backfill existing records:
-- Set initial confidence score based on existing moderation status
UPDATE gtk_osm_submissions
SET 
  confidence_score = CASE 
    WHEN status = 'submitted_to_osm' THEN 95
    WHEN status = 'approved' THEN 85
    WHEN status = 'rejected' THEN 10
    ELSE 50
  END,
  sources_provenance = CASE 
    WHEN sources_provenance IS NULL OR sources_provenance = '[]'::jsonb THEN 
      jsonb_build_array(
        jsonb_build_object(
          'sourceType', COALESCE(source_type, 'community_pwa'),
          'authority', COALESCE(submitted_by_name, 'community_user'),
          'externalId', COALESCE(osm_url, local_spot_id, id::text),
          'distanceDiffMeters', 0,
          'syncedAt', submitted_at
        )
      )
    ELSE sources_provenance
  END,
  last_verified_at = COALESCE(submitted_at, created_at, NOW())
WHERE confidence_score = 50 AND sources_provenance = '[]'::jsonb;
