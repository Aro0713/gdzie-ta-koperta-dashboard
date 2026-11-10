"use client";

import React, { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { DestinationSearch } from "@/components/DestinationSearch";
import { NavigationActionSheet, type SpotDetail } from "@/components/NavigationActionSheet";
import { AddSpotModal } from "@/components/AddSpotModal";
import { ReportIssueModal } from "@/components/ReportIssueModal";
import { NearbySpotsList } from "@/components/NearbySpotsList";
import { MapPointPicker } from "@/components/MapPointPicker";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { getMainSiteUrl } from "@/lib/appUrl";

const GtkMap = dynamic(() => import("@/components/GtkMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-300">
      <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-xs font-medium tracking-wide uppercase">Wczytywanie mapy...</p>
    </div>
  ),
});

export default function AppPage() {
  const [center, setCenter] = useState<[number, number]>([52.237049, 21.017532]);
  const [zoom, setZoom] = useState(14);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [destination, setDestination] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<SpotDetail | null>(null);
  const [navigatingSpot, setNavigatingSpot] = useState<SpotDetail | null>(null);
  const [reportingSpot, setReportingSpot] = useState<SpotDetail | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [clickedMapCoords, setClickedMapCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [nearbySpots, setNearbySpots] = useState<SpotDetail[]>([]);
  const [destinationSpots, setDestinationSpots] = useState<SpotDetail[]>([]);
  const [addModalCoords, setAddModalCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [flyToTrigger, setFlyToTrigger] = useState<{ lat: number; lng: number; zoom?: number; timestamp: number } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [mainSiteUrl, setMainSiteUrl] = useState("/");

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  useEffect(() => {
    // Ustalenie adresu strony głównej (domeny nadrzędnej)
    setMainSiteUrl(getMainSiteUrl());

    // 0. Sprawdzenie parametrów w URL (?lat=...&lng=... oraz ?report=1)
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);

      // Sprawdzenie trybu PWA standalone
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes("android-app://");
      setIsStandalone(standalone);

      if (urlParams.get("report") === "1" || urlParams.get("action") === "report") {
        setIsAddModalOpen(true);
      }

      const urlLat = parseFloat(urlParams.get("lat") || "");
      const urlLng = parseFloat(urlParams.get("lng") || "");
      if (Number.isFinite(urlLat) && Number.isFinite(urlLng)) {
        setCenter([urlLat, urlLng]);
        setZoom(17.5);
        setFlyToTrigger({ lat: urlLat, lng: urlLng, zoom: 17.5, timestamp: Date.now() });
        return; // Użytkownik wskazał konkretne współrzędne w URL
      }
    }

    // 1. Natychmiastowe przywrócenie ostatniej znanej pozycji z cache
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("gtk_last_location");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.lat && parsed?.lng) {
            setUserLocation(parsed);
            setCenter([parsed.lat, parsed.lng]);
            setZoom(16.5);
          }
        }
      } catch {}
    }

    // 2. Pobranie aktualnego GPS
    handleUseMyLocation();

    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const fresh = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(fresh);
          try {
            localStorage.setItem("gtk_last_location", JSON.stringify(fresh));
          } catch {}
        },
        undefined,
        { enableHighAccuracy: false, maximumAge: 30000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setCenter([loc.lat, loc.lng]);
        setZoom(16.5);
        setFlyToTrigger({ lat: loc.lat, lng: loc.lng, zoom: 16.5, timestamp: Date.now() });
        setIsLocating(false);
        try {
          localStorage.setItem("gtk_last_location", JSON.stringify(loc));
        } catch {}
      },
      () => {
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSelectDestination = (dest: { lat: number; lng: number; name: string }) => {
    setDestination(dest);
    setCenter([dest.lat, dest.lng]);
    setZoom(17);
    setClickedMapCoords(null);
    setSelectedSpot(null);
    setNavigatingSpot(null);
    setFlyToTrigger({ lat: dest.lat, lng: dest.lng, zoom: 17, timestamp: Date.now() });
  };

  // Obliczenie top 4 miejsc A, B, C, D dla ustawionego celu
  const topSpots = useMemo(() => {
    if (!destination || destinationSpots.length === 0) return [];
    return destinationSpots.slice(0, 4);
  }, [destination, destinationSpots]);

  // Jeśli użytkownik wybrał miejsce spoza top 4 (np. D lub dalsze na mapie), dołączamy je jako dodatkowe
  const extraSpot = useMemo(() => {
    if (!destination || !selectedSpot) return null;
    const isInsideTop = topSpots.some((s) => s.id === selectedSpot.id);
    if (isInsideTop) return null;

    let dist = selectedSpot.distanceMeters;
    if (dist === undefined && destination) {
      const R = 6371e3;
      const phi1 = (destination.lat * Math.PI) / 180;
      const phi2 = (selectedSpot.lat * Math.PI) / 180;
      const deltaPhi = ((selectedSpot.lat - destination.lat) * Math.PI) / 180;
      const deltaLambda = ((selectedSpot.lng - destination.lng) * Math.PI) / 180;
      const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      dist = R * c;
    }

    return { ...selectedSpot, distanceMeters: dist };
  }, [destination, selectedSpot, topSpots]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-100 font-sans">
      {/* 1. GŁÓWNA MAPA */}
      <div className="absolute inset-0 z-0">
        <GtkMap
          center={center}
          zoom={zoom}
          userLocation={userLocation}
          destination={destination}
          clickedPoint={clickedMapCoords}
          flyToTrigger={flyToTrigger}
          topSpots={topSpots}
          selectedSpot={selectedSpot}
          onSelectSpot={(spot) => {
            if (destination) {
              setSelectedSpot(spot);
              setNavigatingSpot(null);
            } else {
              setNavigatingSpot(spot);
            }
          }}
          onSpotsLoaded={(spots) => setNearbySpots(spots)}
          onDestinationSpotsLoaded={(spots) => {
            setDestinationSpots(spots);
          }}
          onMapClick={(coords) => setClickedMapCoords(coords)}
        />
      </div>

      {/* 2. GÓRNY PASEK NAWIGACYJNY */}
      <header
        className="absolute top-0 left-0 right-0 z-20 pointer-events-none transition-all"
        style={{
          paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
          paddingLeft: "max(0.75rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(0.75rem, env(safe-area-inset-right, 0px))",
        }}
      >
        <div className="max-w-xl mx-auto flex flex-col gap-2">
          {/* Belka z logo i przyciskami */}
          <div className="flex items-center justify-between pointer-events-auto gap-2">
            {/* W PWA standalone: statyczna plakietka, która nie wyrzuca kierowcy z aplikacji; w przeglądarce: link do strony głównej */}
            {isStandalone ? (
              <button
                type="button"
                onClick={handleUseMyLocation}
                aria-label="Aplikacja Gdzie Ta Koperta. Kliknij, aby wycentrować pozycję GPS."
                className="bg-slate-900/90 backdrop-blur-md text-white px-3 py-1.5 rounded-xl shadow-lg border border-slate-800 flex items-center gap-2 shrink-0 active:scale-95 transition focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
              >
                <span className="font-mono text-sky-400 font-extrabold text-xs tracking-wider" aria-hidden="true">♿ GTK</span>
                <span className="text-xs font-bold text-slate-100 hidden sm:inline">Gdzie ta koperta?</span>
              </button>
            ) : (
              <a
                href={mainSiteUrl}
                aria-label="Wróć do strony głównej Gdzie Ta Koperta"
                className="bg-slate-900/90 hover:bg-slate-800/90 backdrop-blur-md text-white px-3 py-1.5 rounded-xl shadow-lg border border-slate-800 flex items-center gap-2 shrink-0 active:scale-95 transition focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
              >
                <span className="font-mono text-sky-400 font-extrabold text-xs tracking-wider" aria-hidden="true">♿ GTK</span>
                <span className="text-xs font-bold text-slate-100 hidden sm:inline">Gdzie ta koperta?</span>
              </a>
            )}

            <div className="flex items-center gap-2">
              {!isStandalone && (
                <a
                  href={mainSiteUrl}
                  title="Wróć do strony głównej serwisu"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white font-semibold text-xs border border-slate-700 shadow-md backdrop-blur-md transition active:scale-95 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                >
                  <span aria-hidden="true">←</span>
                  <span>Strona główna</span>
                </a>
              )}

              <button
                type="button"
                aria-label="Zgłoś nową kopertę parkingową na mapie"
                onClick={() => {
                  const target = clickedMapCoords || (destination ? { lat: destination.lat, lng: destination.lng } : null);
                  setAddModalCoords(target);
                  setIsAddModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-lg shadow-sky-600/30 transition active:scale-95 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
              >
                <span aria-hidden="true">➕</span>
                <span>Zgłoś kopertę</span>
              </button>
            </div>
          </div>

          {/* Wyszukiwarka celów i lista najbliższych kopert */}
          <div className="pointer-events-auto flex flex-col gap-2">
            <DestinationSearch
              onSelectDestination={handleSelectDestination}
              onUseMyLocation={handleUseMyLocation}
              isLocating={isLocating}
            />

            {destination && (
              <NearbySpotsList
                destination={destination}
                spots={destinationSpots}
                extraSpot={extraSpot}
                selectedSpotId={selectedSpot?.id}
                onSelectSpot={(spot) => {
                  setSelectedSpot(spot);
                }}
                onNavigateToSpot={(spot) => {
                  setSelectedSpot(spot);
                  setNavigatingSpot(spot);
                }}
                onClearDestination={() => {
                  setSelectedSpot(null);
                  setNavigatingSpot(null);
                  handleUseMyLocation();
                }}
              />
            )}
          </div>
        </div>
      </header>

      {/* 3. DOLNA LEGENDA STATUSÓW */}
      <footer
        className="absolute left-4 z-10 pointer-events-none hidden sm:block transition-all"
        style={{
          bottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.25rem))",
        }}
      >
        <div className="bg-white/95 text-slate-800 border border-slate-200 px-3 py-2 rounded-xl shadow-md pointer-events-auto text-[11px] font-medium flex items-center gap-3 backdrop-blur-sm">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-600 inline-block" />
            <span>Potwierdzona foto</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-sky-600 inline-block" />
            <span>OpenStreetMap</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-600 inline-block" />
            <span>Parking z kopertami</span>
          </div>
        </div>
      </footer>

      {/* 3a. PRZYCISK MOJEJ LOKALIZACJI */}
      <div
        className="absolute right-4 z-20 pointer-events-auto transition-all"
        style={{
          bottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.25rem))",
        }}
      >
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={isLocating}
          aria-label="Wycentruj mapę na mojej lokalizacji GPS"
          className="w-12 h-12 bg-white/95 hover:bg-white text-slate-700 hover:text-sky-600 rounded-full shadow-xl border border-slate-200/90 flex items-center justify-center transition active:scale-95 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none backdrop-blur-sm"
          title="Wycentruj na mojej pozycji"
        >
          <svg
            className={`w-6 h-6 ${isLocating ? "animate-spin text-sky-600" : "text-slate-700 hover:text-sky-600"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" fill="currentColor" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v3m0 14v3M2 12h3m14 0h3" />
            <circle cx="12" cy="12" r="7.5" strokeWidth={1.8} />
          </svg>
        </button>
      </div>

      {/* 3b. WYBÓR PUNKTU Z MAPY */}
      <MapPointPicker
        coords={clickedMapCoords}
        onSetAsDestination={(dest) => {
          handleSelectDestination(dest);
        }}
        onAddSpotHere={(coords) => {
          setAddModalCoords(coords);
          setIsAddModalOpen(true);
        }}
        onClose={() => setClickedMapCoords(null)}
      />

      {/* 3c. PŁYWAJĄCY PODGLĄD WYBRANEJ KOPERTY */}
      {destination && selectedSpot && !navigatingSpot && (
        <aside
          aria-label="Podgląd wybranej koperty"
          className="absolute left-4 right-4 sm:left-auto sm:right-20 z-20 pointer-events-auto transition-all"
          style={{
            bottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.25rem))",
          }}
        >
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/95 p-3 flex items-center justify-between gap-3 max-w-md mx-auto sm:mx-0">
            <div className="flex items-center gap-2.5 min-w-0">
              {(() => {
                const letters = ["A", "B", "C", "D"];
                const idx = topSpots.findIndex((s) => s.id === selectedSpot.id);
                const letter = idx !== -1 && idx < letters.length ? letters[idx] : "D";
                const isVerified =
                  selectedSpot.sourceType === "gov_official_wfs" ||
                  Boolean(selectedSpot.authority) ||
                  Boolean(
                    selectedSpot.externalId?.startsWith("gdansk_") ||
                    selectedSpot.externalId?.startsWith("wroclaw_") ||
                    selectedSpot.externalId?.startsWith("poznan_") ||
                    selectedSpot.externalId?.startsWith("gdynia_")
                  ) ||
                  selectedSpot.source === "gdzietakoperta" ||
                  selectedSpot.status === "verified" ||
                  selectedSpot.status === "gtk_community";
                const badgeBg = isVerified
                  ? "bg-emerald-600"
                  : selectedSpot.status === "osm"
                  ? "bg-sky-600"
                  : "bg-amber-600";
                return (
                  <div
                    className={`w-8 h-8 rounded-xl ${badgeBg} text-white font-black text-sm flex items-center justify-center shrink-0 shadow-sm`}
                  >
                    {letter}
                  </div>
                );
              })()}
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate">
                  {selectedSpot.address || selectedSpot.name || "Koperta parkingowa"}
                </div>
                <div className="text-[11px] font-semibold text-sky-700 flex items-center gap-1.5">
                  <span>
                    {selectedSpot.distanceMeters !== undefined
                      ? `${Math.round(selectedSpot.distanceMeters)} m od celu`
                      : "w pobliżu"}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-500">
                    {selectedSpot.slotsCount ? `${selectedSpot.slotsCount} stan.` : "1 stan."}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setNavigatingSpot(selectedSpot)}
                className="bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white text-xs font-bold px-3 py-2 rounded-xl shadow-md transition active:scale-95 flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
              >
                <span>Nawiguj</span>
                <span>➔</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedSpot(null)}
                aria-label="Odznacz wybraną kopertę"
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none"
                title="Zamknij podgląd"
              >
                ✕
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* 4. DOLNA SZUFLADA Z WYBOREM NAWIGACJI */}
      <NavigationActionSheet
        spot={navigatingSpot}
        onClose={() => setNavigatingSpot(null)}
        onConfirmPresent={() => {
          showToast("✓ Dziękujemy! Potwierdzenie zostało zarejestrowane.");
        }}
        onReportIssue={(spot) => {
          setReportingSpot(spot);
          setNavigatingSpot(null);
        }}
      />

      {/* 4b. FORMULARZ ZGŁASZANIA PROBLEMU Z KOPERTĄ */}
      <ReportIssueModal
        isOpen={reportingSpot !== null}
        spot={reportingSpot}
        onClose={() => setReportingSpot(null)}
      />

      {/* 5. FORMULARZ DODAWANIA NOWEJ KOPERTY */}
      <AddSpotModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setAddModalCoords(null);
        }}
        initialCoords={addModalCoords}
        currentUserLocation={userLocation}
      />

      {/* 6. POWIADOMIENIE TOAST */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[2000] bg-slate-900/95 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl border border-slate-700 backdrop-blur-md flex items-center gap-2 pointer-events-none"
        >
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 7. PODPOWIEDŹ INSTALACJI PWA (Tylko w przeglądarce, nigdy w PWA!) */}
      <PwaInstallPrompt />
    </main>
  );
}
