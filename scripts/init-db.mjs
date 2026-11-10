import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function main() {
  console.log("Checking DB connection...");
  const [db] = await sql`SELECT current_database(), now()`;
  console.log("Connected to:", db);

  console.log("Enabling PostGIS extension...");
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS postgis;`;
    console.log("PostGIS ready.");
  } catch (err) {
    console.warn("PostGIS notice:", err.message);
  }

  console.log("Creating gtk_osm_submissions table...");
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  console.log("Creating indexes...");
  await sql`
    CREATE INDEX IF NOT EXISTS idx_gtk_submissions_status_coords 
    ON gtk_osm_submissions (status, lat, lng);
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_gtk_submissions_metadata 
    ON gtk_osm_submissions USING GIN (metadata);
  `;

  // Sprawdzamy też tabele pomocnicze dla innych endpointów, jeśli istnieją
  await sql`
    CREATE TABLE IF NOT EXISTS gtk_analytics_events (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      path TEXT,
      session_id TEXT,
      country TEXT,
      city TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public';
  `;
  console.log("All tables in DB:", tables.map(t => t.table_name));

  const columns = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'gtk_osm_submissions'
    ORDER BY ordinal_position;
  `;
  console.log("Columns of gtk_osm_submissions:");
  console.table(columns);
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
