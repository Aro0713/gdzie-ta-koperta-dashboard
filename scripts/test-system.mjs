import { neon } from "@neondatabase/serverless";
import { v2 as cloudinary } from "cloudinary";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function pass(name, details = "") {
  console.log(`  ${colors.green}✔ PASS${colors.reset} ${colors.bold}${name}${colors.reset} ${details ? colors.cyan + details + colors.reset : ""}`);
}

function fail(name, error) {
  console.error(`  ${colors.red}✖ FAIL${colors.reset} ${colors.bold}${name}${colors.reset}`);
  console.error(`    ${colors.red}${error?.message || error}${colors.reset}`);
}

async function runSystemTests() {
  console.log(`\n${colors.bold}====================================================${colors.reset}`);
  console.log(`${colors.bold}♿ Gdzie ta koperta? - AUTOMATYCZNY TEST E2E SYSTEMU${colors.reset}`);
  console.log(`${colors.bold}====================================================\n${colors.reset}`);

  let passedCount = 0;
  let failedCount = 0;

  // ----------------------------------------------------
  // TEST 1: Neon PostgreSQL Connection & Schema
  // ----------------------------------------------------
  console.log(`${colors.yellow}[1/4] Test Bazy Danych (Neon Serverless Postgres)...${colors.reset}`);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    fail("Neon Connection", "Brak zmiennej DATABASE_URL w .env.local");
    failedCount++;
    return;
  }

  const sql = neon(databaseUrl);
  try {
    const t0 = Date.now();
    const [dbInfo] = await sql`SELECT current_database(), now(), version()`;
    const dt = Date.now() - t0;
    pass("Połączenie z bazą Neon", `(${dt}ms, db: ${dbInfo.current_database})`);
    passedCount++;

    // PostGIS check
    const [pgis] = await sql`SELECT PostGIS_Version()`;
    pass("Rozszerzenie PostGIS", `(wersja: ${pgis.postgis_version})`);
    passedCount++;

    // Table & Indexes check
    const columns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'gtk_osm_submissions'
    `;
    const colNames = columns.map(c => c.column_name);
    const requiredCols = ["id", "source_type", "local_spot_id", "lat", "lng", "status", "metadata", "created_at"];
    const missing = requiredCols.filter(col => !colNames.includes(col));
    if (missing.length > 0) {
      throw new Error(`Brakujące kolumny w gtk_osm_submissions: ${missing.join(", ")}`);
    }
    pass("Struktura tabeli gtk_osm_submissions", `(wszystkie ${colNames.length} kolumny obecne)`);
    passedCount++;
  } catch (err) {
    fail("Struktura bazy Neon", err);
    failedCount++;
  }

  // ----------------------------------------------------
  // TEST 2: Cloudinary Ping & Credentials
  // ----------------------------------------------------
  console.log(`\n${colors.yellow}[2/4] Test Autoryzacji Cloudinary CDN...${colors.reset}`);
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  try {
    const t0 = Date.now();
    const ping = await cloudinary.api.ping();
    const dt = Date.now() - t0;
    if (ping.status === "ok") {
      pass("Autoryzacja Cloudinary API", `(${dt}ms, cloud: ${process.env.CLOUDINARY_CLOUD_NAME})`);
      passedCount++;
    } else {
      throw new Error(`Nieoczekiwana odpowiedź Cloudinary: ${JSON.stringify(ping)}`);
    }
  } catch (err) {
    fail("Autoryzacja Cloudinary API", err);
    failedCount++;
  }

  // ----------------------------------------------------
  // TEST 3: Pełny cykl E2E (Upload zdjęcia + Zapis w bazie + CDN check + Cleanup)
  // ----------------------------------------------------
  console.log(`\n${colors.yellow}[3/4] Test Pełnego Cyklu Zgłoszenia Koperty (E2E Spot Submission)...${colors.reset}`);
  const testSpotId = `e2e_test_${Date.now()}`;
  let uploadedPublicId = null;

  try {
    // 3a. Symulacja zdjęcia w pamięci (PNG 1x1)
    const mockImageBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const tUploadStart = Date.now();
    const uploadRes = await cloudinary.uploader.upload(mockImageBase64, {
      folder: "gdzie-ta-koperta/tests",
      public_id: `photo_${testSpotId}`,
      transformation: [{ quality: "auto", fetch_format: "auto" }]
    });
    const dtUpload = Date.now() - tUploadStart;
    uploadedPublicId = uploadRes.public_id;

    pass("Upload zdjęcia na Cloudinary CDN", `(${dtUpload}ms, URL: ${uploadRes.secure_url.slice(0, 48)}...)`);
    passedCount++;

    // 3b. Weryfikacja pobrania z publicznego CDN
    const cdnFetch = await fetch(uploadRes.secure_url);
    if (!cdnFetch.ok) {
      throw new Error(`Publiczny URL zdjęcia zwrócił HTTP status ${cdnFetch.status}`);
    }
    pass("Dostępność zdjęcia przez publiczny CDN", `(HTTP 200 OK, Content-Type: ${cdnFetch.headers.get("content-type")})`);
    passedCount++;

    // 3c. Zapis zgłoszenia do bazy Neon
    const tDbStart = Date.now();
    const metadata = {
      address: "Warszawa, Plac Defilad 1",
      slotsCount: "2",
      notes: "Test automatyczny systemu E2E",
      hasPhoto: true,
      photoUrl: uploadRes.secure_url,
      photoPublicId: uploadRes.public_id,
      submittedAt: new Date().toISOString()
    };

    await sql`
      INSERT INTO gtk_osm_submissions (
        source_type,
        local_spot_id,
        lat,
        lng,
        status,
        metadata
      )
      VALUES (
        'community_e2e_test',
        ${testSpotId},
        52.2319,
        21.0067,
        'pending_verification',
        ${JSON.stringify(metadata)}::jsonb
      )
    `;
    const dtDb = Date.now() - tDbStart;
    pass("Zapis rekordu do Neon PostgreSQL", `(${dtDb}ms, spot_id: ${testSpotId})`);
    passedCount++;

    // 3d. Odczyt i weryfikacja spójności danych
    const [savedRecord] = await sql`
      SELECT id, local_spot_id, status, metadata 
      FROM gtk_osm_submissions 
      WHERE local_spot_id = ${testSpotId}
    `;

    if (!savedRecord || savedRecord.metadata?.photoUrl !== uploadRes.secure_url) {
      throw new Error("Dane odczytane z bazy nie są zgodne z zapisanym zgłoszeniem!");
    }
    pass("Spójność danych rekordu i photoUrl", `(id: ${savedRecord.id.slice(0, 8)}..., status: ${savedRecord.status})`);
    passedCount++;

    // 3e. Sprzątanie zasobów testowych (Cleanup)
    await sql`DELETE FROM gtk_osm_submissions WHERE local_spot_id = ${testSpotId}`;
    await cloudinary.uploader.destroy(uploadedPublicId);
    pass("Sprzątanie środowiska (Cleanup)", "(usunięto testowy rekord z bazy i plik z CDN)");
    passedCount++;
  } catch (err) {
    fail("Cykl zgłoszenia koperty E2E", err);
    failedCount++;

    // Awaryjne sprzątanie
    if (uploadedPublicId) {
      try { await cloudinary.uploader.destroy(uploadedPublicId); } catch {}
    }
    try { await sql`DELETE FROM gtk_osm_submissions WHERE local_spot_id = ${testSpotId}`; } catch {}
  }

  // ----------------------------------------------------
  // TEST 4: Agregacja statystyk i zapytania analityczne
  // ----------------------------------------------------
  console.log(`\n${colors.yellow}[4/4] Test Zapytań Analitycznych i Cache...${colors.reset}`);
  try {
    const t0 = Date.now();
    const [stats] = await sql`
      SELECT
        COUNT(*)::int AS total_submissions,
        COUNT(CASE WHEN status = 'pending_verification' THEN 1 END)::int AS pending_count,
        COUNT(CASE WHEN status = 'submitted_to_osm' THEN 1 END)::int AS osm_count
      FROM gtk_osm_submissions
    `;
    const dt = Date.now() - t0;
    pass("Zapytanie analityczne live-stats", `(${dt}ms, łącznie zgłoszeń: ${stats.total_submissions}, oczekujących: ${stats.pending_count})`);
    passedCount++;
  } catch (err) {
    fail("Zapytanie analityczne", err);
    failedCount++;
  }

  // Podsumowanie
  console.log(`\n${colors.bold}----------------------------------------------------${colors.reset}`);
  if (failedCount === 0) {
    console.log(`${colors.green}${colors.bold}🎉 WSZYSTKIE TESTY ZAKOŃCZONE SUKCESEM! (${passedCount}/${passedCount} PASS)${colors.reset}`);
    console.log(`${colors.cyan}System 'Gdzie ta koperta' jest w 100% sprawny i zintegrowany z chmurą!${colors.reset}\n`);
  } else {
    console.log(`${colors.red}${colors.bold}⚠️ NIEKTÓRE TESTY NIE POWIODŁY SIĘ (${failedCount} błędów, ${passedCount} zaliczonych).${colors.reset}\n`);
  }
}

runSystemTests().catch(err => {
  console.error("Krytyczny błąd skryptu testowego:", err);
  process.exit(1);
});
