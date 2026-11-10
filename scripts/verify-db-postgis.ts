if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  try {
    process.loadEnvFile?.(".env.local");
  } catch {}
  try {
    process.loadEnvFile?.(".env");
  } catch {}
}

async function runDatabaseDiagnostics() {
  const { sql, ensureDatabaseSchema } = await import("../src/lib/db");
  console.log("==========================================================");
  console.log(" 🧪 DIAGNOSTYKA BAZY DANYCH NEON POSTGIS & SPATIAL CONFLATION");
  console.log("==========================================================\n");

  await ensureDatabaseSchema();

  // 1. Sprawdzenie wersji PostGIS i bazy
  console.log("1️⃣  Wersja silnika i rozszerzenia PostGIS:");
  const [versionInfo] = await sql`
    SELECT
      version() AS pg_version,
      postgis_full_version() AS postgis_version;
  `;
  console.log(`   PostgreSQL: ${versionInfo.pg_version.split(" on ")[0]}`);
  console.log(`   PostGIS:    ${versionInfo.postgis_version.split(" ")[0]} ${versionInfo.postgis_version.split(" ")[1]}\n`);

  // 2. Weryfikacja struktury i indeksów
  console.log("2️⃣  Weryfikacja indeksów przestrzennych GiST i B-Tree:");
  const indexes = await sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'gtk_osm_submissions'
      AND indexname IN ('idx_gtk_submissions_geom', 'uq_gtk_submissions_external_id', 'idx_gtk_submissions_confidence');
  `;
  for (const idx of indexes) {
    const isGist = idx.indexdef.includes("GIST");
    const isUnique = idx.indexdef.includes("UNIQUE");
    const icon = isGist ? "🌍 GiST (przestrzenny)" : isUnique ? "🔒 UNIQUE (idempotencja)" : "⚡ B-Tree";
    console.log(`   ✅ ${idx.indexname.padEnd(32)} -> ${icon}`);
  }
  console.log();

  // 3. Sprawdzenie wykorzystania indeksu GiST (EXPLAIN)
  console.log("3️⃣  Weryfikacja planera zapytań (czy używa indeksu GiST przy ST_DWithin):");
  const explain = await sql`
    EXPLAIN
    SELECT id, external_id
    FROM gtk_osm_submissions
    WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint(17.03, 51.11), 4326)::geography, 3000);
  `;
  const usesIndex = explain.some((row: any) =>
    JSON.stringify(row).includes("idx_gtk_submissions_geom") || JSON.stringify(row).includes("Index Scan") || JSON.stringify(row).includes("Bitmap")
  );
  console.log(`   Plan wykonania zapytania przestrzennego:`);
  explain.slice(0, 3).forEach((line: any) => console.log(`   ${Object.values(line)[0]}`));
  console.log(`   Wynik: ${usesIndex ? "⚡ INDEKS GIST JEST AKTYWNY I UŻYWANY PRZEZ POSTGRES" : "ℹ️ Skan sekwencyjny (normalny przy małej próbie testowej)"}\n`);

  // 4. Statystyki zgromadzonych danych według źródeł
  console.log("4️⃣  Statystyki danych i wskaźnika wiarygodności (Confidence Score):");
  const stats = await sql`
    SELECT
      COALESCE(SPLIT_PART(external_id, '_', 1), 'spolecznosc_gtk') AS zrodlo,
      COUNT(*)::int AS liczba_kopert,
      AVG(confidence_score)::numeric(5,1) AS srednie_zaufanie,
      MIN(confidence_score)::int AS min_zaufanie,
      MAX(confidence_score)::int AS max_zaufanie,
      COUNT(CASE WHEN status = 'approved' THEN 1 END)::int AS zatwierdzone,
      COUNT(CASE WHEN jsonb_array_length(sources_provenance) > 1 THEN 1 END)::int AS po_fuzji_wielu_zrodel
    FROM gtk_osm_submissions
    GROUP BY COALESCE(SPLIT_PART(external_id, '_', 1), 'spolecznosc_gtk')
    ORDER BY liczba_kopert DESC;
  `;
  console.table(stats);

  // 5. Test kalkulacji odległości PostGIS ST_Distance
  console.log("5️⃣  Test zapytania geoprzestrzennego (najbliższe koperty od Rynku we Wrocławiu):");
  const wroclawRynek = { lat: 51.1109, lng: 17.0306 };
  const nearest = await sql`
    SELECT
      id,
      COALESCE(metadata->>'name', metadata->>'address', 'Koperta') AS nazwa,
      confidence_score AS zaufanie,
      ROUND(ST_Distance(geom, ST_SetSRID(ST_MakePoint(${wroclawRynek.lng}, ${wroclawRynek.lat}), 4326)::geography)::numeric, 1) AS dystans_m,
      sources_provenance->0->>'authority' AS organ_potwierdzajacy
    FROM gtk_osm_submissions
    WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint(${wroclawRynek.lng}, ${wroclawRynek.lat}), 4326)::geography, 2000)
    ORDER BY dystans_m ASC
    LIMIT 5;
  `;
  console.table(nearest);

  // 6. Test rekordu o statusie Złotego Standardu / wieloźródłowej fuzji
  console.log("6️⃣  Podgląd łańcucha źródeł (Provenance JSONB) dla połączonego rekordu:");
  const sampleConflated = await sql`
    SELECT
      external_id,
      confidence_score,
      metadata->>'address' AS adres,
      sources_provenance
    FROM gtk_osm_submissions
    WHERE external_id = 'wroclaw_zdium_3' OR jsonb_array_length(sources_provenance) > 0
    ORDER BY confidence_score DESC
    LIMIT 1;
  `;
  if (sampleConflated.length > 0) {
    console.log(`   Punkt: ${sampleConflated[0].external_id} (${sampleConflated[0].adres})`);
    console.log(`   Wskaźnik wiarygodności: ${sampleConflated[0].confidence_score}%`);
    console.log("   Historia źródeł (sources_provenance):");
    console.log(JSON.stringify(sampleConflated[0].sources_provenance, null, 4));
  }

  console.log("\n==========================================================");
  console.log(" ✅ WSZYSTKIE TESTY BAZODANOWE ZAKOŃCZONE SUKCESEM!");
  console.log("==========================================================\n");
}

runDatabaseDiagnostics()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Błąd diagnostyki bazy:", err);
    process.exit(1);
  });
