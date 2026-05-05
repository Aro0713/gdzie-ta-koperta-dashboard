"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardSpotList } from "@/components/DashboardSpotList";
import { KopertyMap, type UserAddedSpot } from "@/components/KopertyMap";
import { StatsCards, type StatsCardItem } from "@/components/StatsCards";
import type { OsmParkingResponse } from "@/lib/osmParking";

export function DashboardHome() {
  const [osmData, setOsmData] = useState<OsmParkingResponse | null>(null);
  const [userSpots, setUserSpots] = useState<UserAddedSpot[]>([]);

  const [gtkLiveData, setGtkLiveData] = useState<OsmParkingResponse | null>(
    null
  );
  const [loadingGtkLiveData, setLoadingGtkLiveData] = useState(true);
  const [gtkLiveDataError, setGtkLiveDataError] = useState(false);

  useEffect(() => {
    let active = true;
    let intervalId: number | null = null;

    async function loadGtkLiveData() {
      setGtkLiveDataError(false);

      try {
        const response = await fetch("/api/osm/gtk-parking", {
          cache: "no-store"
        });

        const data = (await response.json()) as OsmParkingResponse;

        if (!response.ok || data.error) {
          throw new Error(data.error || "Nie udało się pobrać GTK z OSM.");
        }

        if (!active) {
          return;
        }

        setGtkLiveData(data);
      } catch {
        if (!active) {
          return;
        }

        setGtkLiveDataError(true);
      } finally {
        if (active) {
          setLoadingGtkLiveData(false);
        }
      }
    }

    void loadGtkLiveData();

    intervalId = window.setInterval(() => {
      void loadGtkLiveData();
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

  const confirmedUserSpots = useMemo(() => {
    return userSpots.filter((spot) => (spot.confirmations || 0) >= 5).length;
  }, [userSpots]);

  const userSpotsToVerify = Math.max(userSpots.length - confirmedUserSpots, 0);

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

  const gtkLiveOsmIds = useMemo(() => {
    const ids = new Set<string>();

    for (const feature of gtkLiveData?.features || []) {
      const osmId = feature.properties?.osmId;

      if (osmId) {
        ids.add(String(osmId));
      }
    }

    return ids;
  }, [gtkLiveData]);

  const localSubmittedGtkNotYetInLiveOsm = useMemo(() => {
    return userSpots.filter((spot) => {
      return (
        spot.status === "osm_submitted" &&
        Boolean(spot.osmNodeId) &&
        !gtkLiveOsmIds.has(String(spot.osmNodeId))
      );
    }).length;
  }, [gtkLiveOsmIds, userSpots]);

  const gtkLiveCount =
    gtkLiveData?.metadata?.count ?? gtkLiveData?.features?.length ?? 0;

  const gtkCountryCount = gtkLiveCount + localSubmittedGtkNotYetInLiveOsm;

  const gtkCountryValue: string | number =
    loadingGtkLiveData && !gtkLiveData
      ? "…"
      : gtkLiveDataError && !gtkLiveData
        ? "—"
        : gtkCountryCount;

  const gtkCountryDetail =
    loadingGtkLiveData && !gtkLiveData
      ? "pobieram koperty GTK z OpenStreetMap"
      : gtkLiveDataError && !gtkLiveData
        ? "brak live danych GTK z OSM"
        : gtkLiveDataError
          ? "ostatnie dane live z OSM, odświeżenie nieudane"
          : localSubmittedGtkNotYetInLiveOsm > 0
            ? `OSM live + ${localSubmittedGtkNotYetInLiveOsm} świeżo wysłane z tej sesji`
            : "dodane przez użytkowników GTK w OpenStreetMap";

  const totalKopertyInVisibleArea = osmExactKoperty + userSpots.length;

  const stats: StatsCardItem[] = [
    {
      label: "koperty w bazie",
      value: totalKopertyInVisibleArea,
      detail: `${osmExactKoperty} dokładnych z OSM + ${userSpots.length} GTK w aktualnym widoku`
    },
    {
      label: "nowe koperty GTK",
      value: gtkCountryValue,
      detail: gtkCountryDetail,
      href: "/mapa?widok=gtk-kraj"
    },
    {
      label: "potwierdzone",
      value: confirmedUserSpots,
      detail: "lokalne szkice GTK po 5 potwierdzeniach"
    },
    {
      label: "do sprawdzenia",
      value: userSpotsToVerify,
      detail: "lokalne szkice GTK czekające na społeczność"
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