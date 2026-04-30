"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardSpotList } from "@/components/DashboardSpotList";
import { KopertyMap, type UserAddedSpot } from "@/components/KopertyMap";
import { StatsCards, type StatsCardItem } from "@/components/StatsCards";
import { readLocalOfficialRequests } from "@/lib/localOfficialRequests";
import type { OsmParkingResponse } from "@/lib/osmParking";

export function DashboardHome() {
  const [osmData, setOsmData] = useState<OsmParkingResponse | null>(null);
  const [userSpots, setUserSpots] = useState<UserAddedSpot[]>([]);
  const [requestCount, setRequestCount] = useState(0);

  useEffect(() => {
    setRequestCount(readLocalOfficialRequests().length);
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

  const totalKopertyInDatabase = osmExactKoperty + userSpots.length;

  const stats: StatsCardItem[] = [
    {
      label: "koperty w bazie",
      value: totalKopertyInDatabase,
      detail: `${osmExactKoperty} dokładnych z OSM + ${userSpots.length} GTK`
    },
    {
      label: "nowe koperty GTK",
      value: userSpots.length,
      detail: "dodane przez użytkowników aplikacji"
    },
    {
      label: "potwierdzone",
      value: confirmedUserSpots,
      detail: "koperta wpada po 5 potwierdzeniach"
    },
    {
      label: "do sprawdzenia",
      value: userSpotsToVerify,
      detail: "dodane, ale jeszcze niepotwierdzone"
    },
    {
      label: "wnioski",
      value: requestCount,
      detail: "z modułu wniosków do urzędu/właściciela"
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
                lokalizacji koperty.
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
              lokalizacji urządzenia. Pokazujemy najpierw dokładne koperty, potem
              parkingi z informacją o miejscach dla OzN.
            </p>
          </div>

          <div className="dashboard-counter-row">
            <span className="map-status-pill">♿ OSM: {osmExactKoperty}</span>
            <span className="map-status-pill">
              P: {osmParkingWithDisabledCapacity}
            </span>
            <span className="map-status-pill">GTK: {userSpots.length}</span>
          </div>
        </div>

        <DashboardSpotList features={visibleFeatures} />
      </section>
    </>
  );
}
