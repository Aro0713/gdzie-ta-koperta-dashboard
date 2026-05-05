"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardSpotList } from "@/components/DashboardSpotList";
import { KopertyMap, type UserAddedSpot } from "@/components/KopertyMap";
import { StatsCards, type StatsCardItem } from "@/components/StatsCards";
import type { OsmParkingResponse } from "@/lib/osmParking";

type GtkCountryStats = {
  total: number;
  confirmed: number;
  toVerify: number;
};

type GtkCountryStatsResponse = Partial<GtkCountryStats> & {
  error?: string;
};

function toSafeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function DashboardHome() {
  const [osmData, setOsmData] = useState<OsmParkingResponse | null>(null);
  const [userSpots, setUserSpots] = useState<UserAddedSpot[]>([]);

  const [gtkCountryStats, setGtkCountryStats] =
    useState<GtkCountryStats | null>(null);
  const [loadingGtkCountryStats, setLoadingGtkCountryStats] = useState(true);
  const [gtkCountryStatsError, setGtkCountryStatsError] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadGtkCountryStats() {
      setLoadingGtkCountryStats(true);
      setGtkCountryStatsError(false);

      try {
        const response = await fetch("/api/gtk-spots/stats", {
          cache: "no-store"
        });

        const data = (await response.json()) as GtkCountryStatsResponse;

        if (!response.ok || data.error) {
          throw new Error(
            data.error || "Nie udało się pobrać krajowych statystyk GTK."
          );
        }

        if (!active) {
          return;
        }

        setGtkCountryStats({
          total: toSafeNumber(data.total),
          confirmed: toSafeNumber(data.confirmed),
          toVerify: toSafeNumber(data.toVerify)
        });
      } catch {
        if (!active) {
          return;
        }

        setGtkCountryStats(null);
        setGtkCountryStatsError(true);
      } finally {
        if (active) {
          setLoadingGtkCountryStats(false);
        }
      }
    }

    void loadGtkCountryStats();

    return () => {
      active = false;
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

  const gtkCountryTotalValue: string | number = loadingGtkCountryStats
    ? "…"
    : gtkCountryStatsError
      ? "—"
      : gtkCountryStats?.total ?? 0;

  const gtkConfirmedValue: string | number = loadingGtkCountryStats
    ? "…"
    : gtkCountryStatsError
      ? "—"
      : gtkCountryStats?.confirmed ?? 0;

  const gtkToVerifyValue: string | number = loadingGtkCountryStats
    ? "…"
    : gtkCountryStatsError
      ? "—"
      : gtkCountryStats?.toVerify ?? 0;

  const gtkCountryDetail = loadingGtkCountryStats
    ? "liczę koperty dodane w całej Polsce"
    : gtkCountryStatsError
      ? "brak krajowych statystyk GTK"
      : "dodane przez użytkowników aplikacji w całej Polsce";

  const totalKopertyInVisibleArea = osmExactKoperty + userSpots.length;

  const stats: StatsCardItem[] = [
    {
      label: "koperty w bazie",
      value: totalKopertyInVisibleArea,
      detail: `${osmExactKoperty} dokładnych z OSM + ${userSpots.length} GTK w aktualnym widoku`
    },
    {
      label: "nowe koperty GTK",
      value: gtkCountryTotalValue,
      detail: gtkCountryDetail,
      href: "/mapa?widok=gtk-kraj"
    },
    {
      label: "potwierdzone",
      value: gtkConfirmedValue,
      detail: "GTK w całej Polsce po 5 potwierdzeniach"
    },
    {
      label: "do sprawdzenia",
      value: gtkToVerifyValue,
      detail: "GTK w całej Polsce czekające na społeczność"
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