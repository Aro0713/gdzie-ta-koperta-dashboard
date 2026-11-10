import { neon } from "@neondatabase/serverless";

function getDatabaseUrl(): string {
  const rawUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED;

  if (!rawUrl) {
    throw new Error(
      "Missing DATABASE_URL. Please run with --env-file=.env.local or set DATABASE_URL."
    );
  }

  return rawUrl.trim().replace(/^["']|["']$/g, "").replace(/\r?\n/g, "");
}

async function runMigration() {
  console.log("🚀 Starting Migration 002: Add PostGIS Conflation to gtk_osm_submissions");
  const dbUrl = getDatabaseUrl();
  const sql = neon(dbUrl);

  // 1. PostGIS Extension
  console.log("Step 1/5: Ensuring PostGIS extension...");
  await sql`CREATE EXTENSION IF NOT EXISTS postgis;`;
  const [postgisVer] = await sql`SELECT PostGIS_Version() AS version;`;
  console.log(`   ✓ PostGIS extension enabled (version: ${postgisVer?.version || "active"})`);

  // 2. Add columns
  console.log("Step 2/5: Adding conflation & provenance columns...");
  await sql`
    ALTER TABLE gtk_osm_submissions
      ADD COLUMN IF NOT EXISTS geom GEOGRAPHY(Point, 4326) 
        GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED,
      ADD COLUMN IF NOT EXISTS external_id TEXT,
      ADD COLUMN IF NOT EXISTS confidence_score SMALLINT NOT NULL DEFAULT 50,
      ADD COLUMN IF NOT EXISTS sources_provenance JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `;
  console.log("   ✓ Columns added or already present (geom, external_id, confidence_score, sources_provenance, last_verified_at)");

  // 3. Add confidence_score range constraint
  console.log("Step 3/5: Adding confidence_score CHECK constraint (0-100)...");
  await sql`
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
  `;
  console.log("   ✓ Constraint chk_gtk_submissions_confidence_range verified");

  // 4. Create Indexes
  console.log("Step 4/5: Creating spatial and query indexes...");
  await sql`
    CREATE INDEX IF NOT EXISTS idx_gtk_submissions_geom 
      ON gtk_osm_submissions USING GIST (geom);
  `;
  console.log("   ✓ Spatial GiST index created: idx_gtk_submissions_geom");

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_gtk_submissions_external_id 
      ON gtk_osm_submissions (external_id) 
      WHERE external_id IS NOT NULL;
  `;
  console.log("   ✓ Partial unique index created: uq_gtk_submissions_external_id (WHERE external_id IS NOT NULL)");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_gtk_submissions_confidence 
      ON gtk_osm_submissions (confidence_score);
  `;
  console.log("   ✓ B-Tree index created: idx_gtk_submissions_confidence");

  // 5. Backfill existing records
  console.log("Step 5/5: Backfilling existing records...");
  const updateResult = await sql`
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
  `;
  console.log("   ✓ Backfill completed for existing submissions");

  // Validation
  console.log("\n📊 Verification & Quality Inspection:");
  const [stats] = await sql`
    SELECT 
      count(*)::int AS total_rows,
      count(geom)::int AS rows_with_geom,
      count(CASE WHEN geom IS NOT NULL THEN 1 END)::int AS valid_geoms,
      avg(confidence_score)::numeric(5,2) AS avg_confidence,
      count(CASE WHEN external_id IS NOT NULL THEN 1 END)::int AS rows_with_external_id
    FROM gtk_osm_submissions;
  `;
  console.table([stats]);

  const sampleRows = await sql`
    SELECT 
      id, 
      source_type, 
      lat, 
      lng, 
      ST_AsText(geom) AS geom_wkt, 
      confidence_score, 
      sources_provenance->0->>'sourceType' AS first_source,
      last_verified_at
    FROM gtk_osm_submissions
    LIMIT 3;
  `;
  console.log("\nSample migrated records:");
  console.table(sampleRows);

  console.log("\n✅ Migration 002 completed successfully!");
}

runMigration().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
