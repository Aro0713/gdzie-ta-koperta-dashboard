import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatsRow = {
  page_views: number;
  visitors: number;
};

type CountryRow = {
  country: string;
  views: number;
};

const BASELINE_STATS = {
  pageViews: 1440,
  visitors: 300,
  countries: [
    {
      country: "Polska",
      views: 1400,
      visitors: 293
    },
    {
      country: "Stany Zjednoczone",
      views: 4,
      visitors: 4
    },
    {
      country: "Holandia",
      views: 3,
      visitors: 3
    },
    {
      country: "Szwajcaria",
      views: 3,
      visitors: 1
    },
    {
      country: "Niemcy",
      views: 2,
      visitors: 1
    },
    {
      country: "Irlandia",
      views: 1,
      visitors: 1
    },
    {
      country: "Portugalia",
      views: 2,
      visitors: 1
    }
  ]
};

function toSafeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeCountryName(value: string | null | undefined) {
  const country = String(value || "").trim();

  if (!country) {
    return "Nieznany kraj";
  }

  const normalized = country.toLowerCase();

  const names: Record<string, string> = {
    pl: "Polska",
    poland: "Polska",
    polska: "Polska",

    us: "Stany Zjednoczone",
    usa: "Stany Zjednoczone",
    "united states": "Stany Zjednoczone",
    "united states of america": "Stany Zjednoczone",

    nl: "Holandia",
    netherlands: "Holandia",
    holandia: "Holandia",

    ch: "Szwajcaria",
    switzerland: "Szwajcaria",
    szwajcaria: "Szwajcaria",

    de: "Niemcy",
    germany: "Niemcy",
    niemcy: "Niemcy",

    ie: "Irlandia",
    ireland: "Irlandia",
    irlandia: "Irlandia",

    pt: "Portugalia",
    portugal: "Portugalia",
    portugalia: "Portugalia"
  };

  return names[normalized] || country;
}

function formatViews(value: number) {
  if (value >= 1000) {
    const thousands = value / 1000;

    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1).replace(".", ",")}K`;
  }

  return String(value);
}

function formatCountriesDetail(rows: CountryRow[]) {
  if (rows.length === 0) {
    return "brak danych o krajach";
  }

  return rows
    .slice(0, 4)
    .map((row) => `${row.country}: ${formatViews(row.views)}`)
    .join(", ");
}

function mergeCountryRows(liveRows: CountryRow[]) {
  const merged = new Map<string, CountryRow>();

  for (const baselineCountry of BASELINE_STATS.countries) {
    merged.set(baselineCountry.country, {
      country: baselineCountry.country,
      views: baselineCountry.views
    });
  }

  for (const row of liveRows) {
    const country = normalizeCountryName(row.country);
    const current = merged.get(country);

    if (current) {
      current.views += toSafeNumber(row.views);
    } else {
      merged.set(country, {
        country,
        views: toSafeNumber(row.views)
      });
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.views - a.views);
}

export async function GET() {
  try {
    const statsRows = (await sql`
      SELECT
        COUNT(*)::int AS page_views,
        COUNT(
          DISTINCT COALESCE(
            NULLIF(device_id, ''),
            NULLIF(session_id, ''),
            event_hash
          )
        )::int AS visitors
      FROM gtk_analytics_events
      WHERE
        COALESCE(schema, '') <> 'gtk-test'
        AND COALESCE(project_id, '') <> 'local-test'
        AND (
          event_type ILIKE '%page%'
          OR event_name ILIKE '%page%'
          OR event_type = 'unknown'
        )
    `) as StatsRow[];

    const countryRows = (await sql`
      SELECT
        COALESCE(country, 'unknown') AS country,
        COUNT(*)::int AS views
      FROM gtk_analytics_events
      WHERE
        country IS NOT NULL
        AND COALESCE(schema, '') <> 'gtk-test'
        AND COALESCE(project_id, '') <> 'local-test'
        AND (
          event_type ILIKE '%page%'
          OR event_name ILIKE '%page%'
          OR event_type = 'unknown'
        )
      GROUP BY country
      ORDER BY views DESC
      LIMIT 20
    `) as CountryRow[];

    const liveStats = statsRows[0] || {
      page_views: 0,
      visitors: 0
    };

    const mergedCountries = mergeCountryRows(countryRows);

    const pageViews =
      BASELINE_STATS.pageViews + toSafeNumber(liveStats.page_views);

    const visitors =
      BASELINE_STATS.visitors + toSafeNumber(liveStats.visitors);

    return NextResponse.json({
      ok: true,
      range: "all",
      baseline: {
        pageViews: BASELINE_STATS.pageViews,
        visitors: BASELINE_STATS.visitors,
        countries: BASELINE_STATS.countries.length
      },
      liveSinceDrain: {
        pageViews: toSafeNumber(liveStats.page_views),
        visitors: toSafeNumber(liveStats.visitors)
      },
      pageViews,
      visitors,
      countries: mergedCountries.length,
      countriesDetail: formatCountriesDetail(mergedCountries),
      topCountries: mergedCountries.map((row) => ({
        country: row.country,
        views: toSafeNumber(row.views)
      }))
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown dashboard stats error";

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load dashboard live stats",
        details: message
      },
      {
        status: 500
      }
    );
  }
}