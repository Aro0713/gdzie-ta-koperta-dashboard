import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatsRow = {
  page_views: number;
  visitors: number;
  countries: number;
};

type CountryRow = {
  country: string;
  views: number;
};

function toSafeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatCountriesDetail(rows: CountryRow[]) {
  if (rows.length === 0) {
    return "brak danych o krajach";
  }

  return rows
    .slice(0, 4)
    .map((row) => `${row.country}: ${row.views}`)
    .join(", ");
}

export async function GET() {
  try {
    const statsRows = (await sql`
      SELECT
        COUNT(*)::int AS page_views,
        COUNT(DISTINCT COALESCE(device_id, session_id))::int AS visitors,
        COUNT(DISTINCT country)::int AS countries
      FROM gtk_analytics_events
      WHERE
        occurred_at >= now() - interval '30 days'
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
        occurred_at >= now() - interval '30 days'
        AND country IS NOT NULL
        AND (
          event_type ILIKE '%page%'
          OR event_name ILIKE '%page%'
          OR event_type = 'unknown'
        )
      GROUP BY country
      ORDER BY views DESC
      LIMIT 6
    `) as CountryRow[];

    const stats = statsRows[0] || {
      page_views: 0,
      visitors: 0,
      countries: 0
    };

    return NextResponse.json({
      ok: true,
      range: "30d",
      pageViews: toSafeNumber(stats.page_views),
      visitors: toSafeNumber(stats.visitors),
      countries: toSafeNumber(stats.countries),
      countriesDetail: formatCountriesDetail(countryRows),
      topCountries: countryRows.map((row) => ({
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