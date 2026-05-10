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

type GtkOsmStatsResponse = {
  ok?: boolean;
  baseline?: {
    source: string;
    capturedAt: string;
    contributors: number;
    mapChanges: number;
    changesets: number;
    createdNodes: number;
    countries: Array<{
      country: string;
      contributors: number;
      changesets: number;
      mapChanges: number;
    }>;
  };
  liveSinceRegistry?: {
    submissions: number;
    contributors: number;
    changesets: number;
  };
  totals?: {
    contributors: number;
    mapChanges: number;
    changesets: number;
    createdNodes: number;
    countries: number;
    countriesDetail: string;
  };
  error?: string;
};

type AiCandidate = {
  id: string;
  status: string;
  lat: number;
  lng: number;
  confidence: number;
  modelVersion: string;
  imagerySource?: string | null;
  thumbnailUrl?: string | null;
  createdAt: string;
};

type AiCandidatesResponse = {
  ok?: boolean;
  candidates?: AiCandidate[];
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

  const [gtkOsmStats, setGtkOsmStats] =
    useState<GtkOsmStatsResponse | null>(null);
  const [loadingGtkOsmStats, setLoadingGtkOsmStats] = useState(true);
  const [gtkOsmStatsError, setGtkOsmStatsError] = useState(false);

  const [aiCandidates, setAiCandidates] = useState<AiCandidate[]>([]);
  const [loadingAiCandidates, setLoadingAiCandidates] = useState(true);
  const [aiCandidatesError, setAiCandidatesError] = useState(false);

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

  useEffect(() => {
    let active = true;
    let intervalId: number | null = null;

    async function loadGtkOsmStats() {
      setGtkOsmStatsError(false);

      try {
        const response = await fetch("/api/dashboard/gtk-osm-stats", {
          cache: "no-store"
        });

        const data = (await response.json()) as GtkOsmStatsResponse;

        if (!response.ok || !data.ok || data.error) {
          throw new Error(data.error || "Nie udało się pobrać statystyk OSM GTK.");
        }

        if (!active) {
          return;
        }

        setGtkOsmStats(data);
      } catch {
        if (!active) {
          return;
        }

        setGtkOsmStatsError(true);
      } finally {
        if (active) {
          setLoadingGtkOsmStats(false);
        }
      }
    }

    void loadGtkOsmStats();

    intervalId = window.setInterval(() => {
      void loadGtkOsmStats();
    }, 60000);

    return () => {
      active = false;

      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    let intervalId: number | null = null;

    async function loadAiCandidates() {
      setAiCandidatesError(false);

      try {
        const response = await fetch("/api/ai-candidates", {
          cache: "no-store"
        });

        const data = (await response.json()) as AiCandidatesResponse;

        if (!response.ok || !data.ok || data.error) {
          throw new Error(data.error || "Nie udało się pobrać kandydatów AI.");
        }

        if (!active) {
          return;
        }

        setAiCandidates(data.candidates || []);
      } catch {
        if (!active) {
          return;
        }

        setAiCandidates([]);
        setAiCandidatesError(true);
      } finally {
        if (active) {
          setLoadingAiCandidates(false);
        }
      }
    }

    void loadAiCandidates();

    intervalId = window.setInterval(() => {
      void loadAiCandidates();
    }, 60000);

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
      ? "Pobieram dane z Vercel Analytics"
      : liveStatsError && !liveStats
        ? "Brak live danych z Vercel Analytics"
        : "Łączna liczba odsłon strony";

  const visitorsDetail =
    loadingLiveStats && !liveStats
      ? "Pobieram dane z Vercel Analytics"
      : liveStatsError && !liveStats
        ? "Brak live danych z Vercel Analytics"
        : "Łączna liczba odwiedzających";

  const countriesDetail =
    loadingLiveStats && !liveStats
      ? "Pobieram kraje z Vercel Analytics"
      : liveStatsError && !liveStats
        ? "Brak live danych o krajach"
        : liveStats?.countriesDetail || "Brak danych o krajach";

  const osmAddedValue: string | number = loadingGtkOsmStats
    ? "…"
    : gtkOsmStatsError && !gtkOsmStats
      ? "—"
      : formatStatNumber(gtkOsmStats?.totals?.createdNodes);

  const osmContributorsValue: string | number = loadingGtkOsmStats
    ? "…"
    : gtkOsmStatsError && !gtkOsmStats
      ? "—"
      : formatStatNumber(gtkOsmStats?.totals?.contributors);

  const osmChangesetsValue: string | number = loadingGtkOsmStats
    ? "…"
    : gtkOsmStatsError && !gtkOsmStats
      ? "—"
      : formatStatNumber(gtkOsmStats?.totals?.changesets);

  const osmCountriesValue: string | number = loadingGtkOsmStats
    ? "…"
    : gtkOsmStatsError && !gtkOsmStats
      ? "—"
      : formatStatNumber(gtkOsmStats?.totals?.countries);

  const osmAddedDetail =
    loadingGtkOsmStats && !gtkOsmStats
      ? "Pobieram statystyki OSM GTK"
      : gtkOsmStatsError && !gtkOsmStats
        ? "Brak danych statystyk OSM GTK"
        : "Utworzone punkty OSM powiązane z GdzieTaKoperta";

  const osmContributorsDetail =
    loadingGtkOsmStats && !gtkOsmStats
      ? "Pobieram statystyki OSM GTK"
      : gtkOsmStatsError && !gtkOsmStats
        ? "Brak danych współtwórców OSM"
        : "Osoby, które dodały zmiany powiązane z GdzieTaKoperta";

  const osmChangesetsDetail =
    loadingGtkOsmStats && !gtkOsmStats
      ? "Pobieram statystyki OSM GTK"
      : gtkOsmStatsError && !gtkOsmStats
        ? "Brak danych changesetów OSM"
        : "Zestawy zmian OSM z hasłem GdzieTaKoperta";

  const osmCountriesDetail =
    loadingGtkOsmStats && !gtkOsmStats
      ? "Pobieram kraje zmian OSM"
      : gtkOsmStatsError && !gtkOsmStats
        ? "Brak danych krajów zmian OSM"
        : gtkOsmStats?.totals?.countriesDetail || "Brak danych krajów zmian OSM";

  const aiCandidatesValue: string | number = loadingAiCandidates
    ? "…"
    : aiCandidatesError
      ? "—"
      : aiCandidates.length;

  const aiCandidatesDetail = loadingAiCandidates
    ? "Pobieram kandydatów z Neon"
    : aiCandidatesError
      ? "Brak danych kandydatów AI"
      : "Wykryte przez crawlera i czekające na weryfikację";

  const pageStats: StatsCardItem[] = [
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

  const osmImpactStats: StatsCardItem[] = [
    {
      label: "Koperty dodane do OSM",
      value: osmAddedValue,
      detail: osmAddedDetail
    },
    {
      label: "Współtwórcy OSM",
      value: osmContributorsValue,
      detail: osmContributorsDetail
    },
    {
      label: "Zestawy zmian OSM",
      value: osmChangesetsValue,
      detail: osmChangesetsDetail
    },
    {
      label: "Kraje zmian OSM",
      value: osmCountriesValue,
      detail: osmCountriesDetail
    }
  ];

  return (
    <>
      <StatsCards items={pageStats} />

      <StatsCards items={osmImpactStats} />

      <Link
        href="/mapa?widok=gtk-kraj"
        className="dashboard-ai-candidates-card"
        aria-label={`Kandydaci AI GTK: ${aiCandidatesValue}. ${aiCandidatesDetail}`}
      >
        <div className="dashboard-ai-candidates-main">
          <span className="dashboard-ai-candidates-badge">AI</span>

          <div>
            <p className="eyebrow">Kandydaci AI</p>
            <h2>Kandydaci AI GTK</h2>
            <p>
              Crawler wykrył potencjalne koperty na ortofotomapie. Kliknij, aby
              zobaczyć je na mapie i zweryfikować przed wysłaniem do OSM.
            </p>
          </div>
        </div>

        <div className="dashboard-ai-candidates-counter">
          <strong>{aiCandidatesValue}</strong>
          <span>{aiCandidatesDetail}</span>
        </div>
      </Link>

      <section className="dashboard-map-wide">
        <div className="panel panel-large dashboard-map-panel">
          <div className="panel-header dashboard-map-header">
            <div>
              <p className="eyebrow">Mapa</p>
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
            <p className="eyebrow">Realne dane z lokalizacji</p>
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
            <span className="map-status-pill">AI GTK: {aiCandidates.length}</span>
          </div>
        </div>

        <DashboardSpotList features={visibleFeatures} />
      </section>
    </>
  );
}