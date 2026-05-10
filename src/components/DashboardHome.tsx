"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardSpotList } from "@/components/DashboardSpotList";
import { KopertyMap, type UserAddedSpot } from "@/components/KopertyMap";
import { StatsCards, type StatsCardItem } from "@/components/StatsCards";
import type { OsmParkingResponse } from "@/lib/osmParking";

type DashboardLiveStatsResponse = {
  ok?: boolean;
  range?: string;
  pageViews?: number;
  visitors?: number;
  countries?: number;
  countriesDetail?: string;
  topCountries?: Array<{
    country: string;
    views: number;
  }>;
  error?: string;
};

function formatStatNumber(value: number | undefined | null) {
  const safeValue = Number(value);

  if (!Number.isFinite(safeValue)) {
    return "0";
  }

  return safeValue.toLocaleString("pl-PL");
}

export function DashboardHome() {
  const [osmData, setOsmData] = useState<OsmParkingResponse | null>(null);
  const [userSpots, setUserSpots] = useState<UserAddedSpot[]>([]);

  const [liveStats, setLiveStats] =
    useState<DashboardLiveStatsResponse | null>(null);
  const [loadingLiveStats, setLoadingLiveStats] = useState(true);
  const [liveStatsError, setLiveStatsError] = useState(false);

  useEffect(() => {
    let active = true;
    let intervalId: number | null = null;

    async function loadLiveStats() {
      setLiveStatsError(false);

      try {
        const response = await fetch("/api/dashboard/live-stats", {
          cache: "no-store"
        });

        const data = (await response.json()) as DashboardLiveStatsResponse;

        if (!response.ok || !data.ok || data.error) {
          throw new Error(data.error || "Nie udało się pobrać live statystyk.");
        }

        if (!active) {
          return;
        }

        setLiveStats(data);
      } catch {
        if (!active) {
          return;
        }

        setLiveStatsError(true);
      } finally {
        if (active) {
          setLoadingLiveStats(false);
        }
      }
    }

    void loadLiveStats();

    intervalId = window.setInterval(() => {
      void loadLiveStats();
    }, 30000);

    return () => {
      active = false;

      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  const osmExactKoperty = useMemo(() => {
    return (osmData?.features || []).filter(
      (feature) => feature.properties?.objectType === "disabled_parking_space"
    ).length;
  }, [osmData]);

  const osmParkingWithDisabledCapacity = useMemo(() => {
    return (osmData?.features || []).filter(
      (feature) =>
        feature.properties?.objectType === "parking_with_disabled_capacity"
    ).length;
  }, [osmData]);

  const visibleFeatures = useMemo(() => {
    return [...(osmData?.features || [])]
      .sort((a, b) => {
        const firstType =
          a.properties?.objectType === "disabled_parking_space" ? 0 : 1;
        const secondType =
          b.properties?.objectType === "disabled_parking_space" ? 0 : 1;

        if (firstType !== secondType) {
          return firstType - secondType;
        }

        const firstDistance =
          a.properties?.distanceMeters ?? Number.MAX_SAFE_INTEGER;
        const secondDistance =
          b.properties?.distanceMeters ?? Number.MAX_SAFE_INTEGER;

        return firstDistance - secondDistance;
      })
      .slice(0, 18);
  }, [osmData]);

  const totalKopertyInVisibleArea = osmExactKoperty + userSpots.length;

  const pageViewsValue: string | number = loadingLiveStats
    ? "…"
    : liveStatsError && !liveStats
      ? "—"
      : formatStatNumber(liveStats?.pageViews);

  const visitorsValue: string | number = loadingLiveStats
    ? "…"
    : liveStatsError && !liveStats
      ? "—"
      : formatStatNumber(liveStats?.visitors);

  const countriesValue: string | number = loadingLiveStats
    ? "…"
    : liveStatsError && !liveStats
      ? "—"
      : formatStatNumber(liveStats?.countries);

  const pageViewsDetail =
    loadingLiveStats && !liveStats
      ? "pobieram dane z Vercel Analytics"
      : liveStatsError && !liveStats
        ? "brak live danych z Vercel Analytics"
        : "łączna liczba odsłon strony";

  const visitorsDetail =
    loadingLiveStats && !liveStats
      ? "pobieram dane z Vercel Analytics"
      : liveStatsError && !liveStats
        ? "brak live danych z Vercel Analytics"
        : "łączna liczba odwiedzających";

  const countriesDetail =
    loadingLiveStats && !liveStats
      ? "pobieram kraje z Vercel Analytics"
      : liveStatsError && !liveStats
        ? "brak live danych o krajach"
        : liveStats?.countriesDetail || "brak danych o krajach";

  const stats: StatsCardItem[] = [
  {
    label: "Koperty w bazie",
    value: totalKopertyInVisibleArea,
    detail: `${osmExactKoperty} dokładnych z OSM + ${userSpots.length} GTK w aktualnym widoku`
  },
  {
    label: "Odsłony strony",
    value: pageViewsValue,
    detail: pageViewsDetail
  },
  {
    label: "Odwiedzający",
    value: visitorsValue,
    detail: visitorsDetail
  },
  {
    label: "Kraje",
    value: countriesValue,
    detail: countriesDetail
  }
];

  return (
    <>
      <StatsCards items={stats} />

      <section className="dashboard-map-wide">
        <div className="panel panel-large dashboard-map-panel">
          <div className="panel-header dashboard-map-header">
            <div>
              <p className="eyebrow">mapa</p>
              <h2>Koperty i parkingi w Twojej okolicy</h2>
              <p className="dashboard-map-note">
                ♿ oznacza dokładną kopertę z OSM. P oznacza parking z informacją
                o miejscach dla osób z niepełnosprawnościami, ale bez dokładnej
                lokalizacji koperty. Punkty GTK są szkicami dodanymi z mapy.
              </p>
            </div>

            <Link href="/mapa" className="text-link">
              Pełny widok
            </Link>
          </div>

          <KopertyMap
            full
            onOsmData={setOsmData}
            onUserSpotsChange={setUserSpots}
          />
        </div>
      </section>

      <section className="panel dashboard-last-points-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">realne dane z lokalizacji</p>
            <h2>Ostatnio pobrane punkty</h2>
            <p className="dashboard-map-note">
              Lista jest budowana z danych OSM pobranych dla aktualnej
              lokalizacji urządzenia. Pokazujemy najpierw dokładne koperty,
              potem parkingi z informacją o miejscach dla OzN.
            </p>
          </div>

          <div className="dashboard-counter-row">
            <span className="map-status-pill">♿ OSM: {osmExactKoperty}</span>
            <span className="map-status-pill">
              P: {osmParkingWithDisabledCapacity}
            </span>
            <span className="map-status-pill">GTK lokalnie: {userSpots.length}</span>
          </div>
        </div>

        <DashboardSpotList features={visibleFeatures} />
      </section>
    </>
  );
}