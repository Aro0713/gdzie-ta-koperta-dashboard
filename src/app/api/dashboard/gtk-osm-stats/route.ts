import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubmissionStatsRow = {
  submissions: number;
  contributors: number;
  changesets: number;
};

const GTK_OSM_BASELINE = {
  source: "ResultMaps OSM Changesets filtered by GdzieTaKoperta",
  capturedAt: "2026-05-10",
  contributors: 14,
  mapChanges: 222,
  changesets: 222,
  createdNodes: 222,
  countries: [
    {
      country: "Polska",
      contributors: 14,
      changesets: 220,
      mapChanges: 220
    },
    {
      country: "Czechy",
      contributors: 1,
      changesets: 2,
      mapChanges: 2
    }
  ]
};

function toSafeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatCountriesDetail() {
  return GTK_OSM_BASELINE.countries
    .map((country) => `${country.country}: ${country.mapChanges}`)
    .join(", ");
}

export async function GET() {
  try {
    const rows = (await sql`
      SELECT
        COUNT(*)::int AS submissions,
        COUNT(DISTINCT submitted_by_osm_id)::int AS contributors,
        COUNT(DISTINCT osm_changeset_id)::int AS changesets
      FROM gtk_osm_submissions
      WHERE status = 'submitted_to_osm'
    `) as SubmissionStatsRow[];

    const live = rows[0] || {
      submissions: 0,
      contributors: 0,
      changesets: 0
    };

    const liveSubmissions = toSafeNumber(live.submissions);
    const liveContributors = toSafeNumber(live.contributors);
    const liveChangesets = toSafeNumber(live.changesets);

    return NextResponse.json({
      ok: true,
      baseline: GTK_OSM_BASELINE,
      liveSinceRegistry: {
        submissions: liveSubmissions,
        contributors: liveContributors,
        changesets: liveChangesets
      },
      totals: {
        contributors: GTK_OSM_BASELINE.contributors + liveContributors,
        mapChanges: GTK_OSM_BASELINE.mapChanges + liveSubmissions,
        changesets: GTK_OSM_BASELINE.changesets + liveChangesets,
        createdNodes: GTK_OSM_BASELINE.createdNodes + liveSubmissions,
        countries: GTK_OSM_BASELINE.countries.length,
        countriesDetail: formatCountriesDetail()
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown GTK OSM stats error";

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to load GTK OSM stats",
        details: message
      },
      {
        status: 500
      }
    );
  }
}