"use client";

import React, { useState, useEffect } from "react";
import { getNavigationApps } from "@/lib/navigationDeepLinks";
import { useSwipeDownDismiss } from "@/hooks/useSwipeDownDismiss";

export interface SpotDetail {
  id: string;
  name?: string;
  lat: number;
  lng: number;
  address?: string;
  status: "verified" | "gtk_community" | "osm" | "general_parking";
  source?: "gdzietakoperta" | "osm" | string;
  slotsCount?: number | string;
  photoUrl?: string;
  notes?: string;
  verifiedCount?: number;
  lastVerifiedAt?: string;
  distanceMeters?: number;
  externalId?: string | null;
  confidenceScore?: number;
  sourcesProvenance?: Array<{
    sourceType?: string;
    externalId?: string | null;
    authority?: string | null;
    distanceDiffMeters?: number | null;
    syncedAt?: string;
    metadata?: Record<string, unknown>;
  }>;
  sourceType?: string | null;
  authority?: string | null;
}

interface NavigationActionSheetProps {
  spot: SpotDetail | null;
  onClose: () => void;
  onConfirmPresent?: (id: string) => void;
  onReportIssue?: (spot: SpotDetail) => void;
}

export function NavigationActionSheet({
  spot,
  onClose,
  onConfirmPresent,
  onReportIssue
}: NavigationActionSheetProps) {
  const [showAllApps, setShowAllApps] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Stan potwierdzenia kierowcy w stylu Yanosika
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [confirmationsCount, setConfirmationsCount] = useState(0);

  useEffect(() => {
    if (!spot) return;
    const isAlreadyConfirmed = typeof window !== "undefined" && Boolean(localStorage.getItem(`gtk_confirmed_${spot.id}`));
    setHasConfirmed(isAlreadyConfirmed);
    setConfirmationsCount(spot.verifiedCount || 0);
  }, [spot?.id, spot?.verifiedCount]);

  const handleConfirmPresent = () => {
    if (!spot || hasConfirmed) return;
    setHasConfirmed(true);
    setConfirmationsCount((prev) => prev + 1);
    try {
      localStorage.setItem(`gtk_confirmed_${spot.id}`, "true");
    } catch {}

    // Wysłanie lajka do API w tle
    fetch("/api/spots/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spotId: spot.id,
        lat: spot.lat,
        lng: spot.lng,
        address: spot.address || spot.name,
      }),
    }).catch(() => {});

    onConfirmPresent?.(spot.id);
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 220);
  };

  const { bindDragArea, sheetStyle } = useSwipeDownDismiss({
    onDismiss: handleClose,
    threshold: 65,
  });

  if (!spot) return null;

  const isIos = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  const navApps = getNavigationApps({
    lat: spot.lat,
    lng: spot.lng,
    label: spot.name || "Koperta parkingowa"
  });

  // Domyślna aplikacja: Apple Maps dla iOS, Google Maps dla reszty
  const primaryApp = isIos
    ? navApps.find((a) => a.id === "apple") || navApps[0]
    : navApps.find((a) => a.id === "google") || navApps[0];

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Koperta dla osób z niepełnosprawnościami",
          text: `Nawigacja do miejsca parkingowego: ${spot.address || spot.name || ""}`,
          url: `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`,
        });
      } catch {
        // Użytkownik zamknął natywny dialog
      }
    }
  };

  const isGovAuthority = (auth?: string | null) => {
    if (!auth) return false;
    const lower = auth.toLowerCase();
    if (
      lower.includes("kierowca") ||
      lower.includes("community") ||
      lower.includes("społeczność") ||
      lower.includes("spolecznosc") ||
      lower.includes("driver") ||
      lower.includes("użytkownik") ||
      lower.includes("uzytkownik")
    ) {
      return false;
    }
    return (
      lower.includes("zdium") ||
      lower.includes("zdm") ||
      lower.includes("gzdiz") ||
      lower.includes("zdiz") ||
      lower.includes("urząd") ||
      lower.includes("urzad") ||
      lower.includes("miejsk") ||
      lower.includes("gov")
    );
  };

  const isGov =
    spot.sourceType === "gov_official_wfs" ||
    isGovAuthority(spot.authority) ||
    Boolean(
      spot.externalId?.startsWith("gdansk_") ||
      spot.externalId?.startsWith("wroclaw_") ||
      spot.externalId?.startsWith("poznan_") ||
      spot.externalId?.startsWith("gdynia_")
    ) ||
    Boolean(
      spot.sourcesProvenance?.some(
        (p) => p.sourceType === "gov_official_wfs" || isGovAuthority(p.authority)
      )
    );

  const authorityName =
    (isGovAuthority(spot.authority) && spot.authority) ||
    spot.sourcesProvenance?.find((p) => isGovAuthority(p.authority))?.authority ||
    (spot.externalId?.startsWith("gdansk_")
      ? "GZDiZ Gdańsk"
      : spot.externalId?.startsWith("wroclaw_")
      ? "ZDiUM Wrocław"
      : spot.externalId?.startsWith("poznan_")
      ? "ZDM Poznań"
      : spot.externalId?.startsWith("gdynia_")
      ? "ZDiZ Gdynia"
      : "Rejestr Miejski");

  // Zatwierdzone przez GTK: wyłącznie zgłoszenia z bazy GTK zatwierdzone przez administratora
  const isGtkCommunity =
    !isGov &&
    (spot.source === "gdzietakoperta" ||
      spot.status === "gtk_community");

  // Pozostałe to punkty z OpenStreetMap (OSM)
  const isOsm = !isGov && !isGtkCommunity;
  const isOsmConfirmed = isOsm && (hasConfirmed || confirmationsCount > 0);

  const getStatusBadge = () => {
    if (isGov) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
          <span>Zweryfikowano urzędowo: {authorityName}</span>
        </span>
      );
    }

    if (isGtkCommunity) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Zatwierdzone przez GTK 🛡️</span>
        </span>
      );
    }

    if (isOsmConfirmed) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-50 text-sky-900 border border-sky-300 shadow-xs">
          <span className="w-2 h-2 rounded-full bg-sky-500" />
          <span>Miejsce z OSM • Potwierdzone 👍</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300 shadow-xs">
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <span>Miejsce z OSM • Brak potwierdzenia ⚠️</span>
      </span>
    );
  };

  return (
    <div
      className={`fixed inset-0 z-[1000] flex flex-col justify-end bg-slate-900/40 backdrop-blur-sm gtk-sheet-backdrop p-0 sm:p-4 ${
        isClosing ? "gtk-sheet-closing" : ""
      }`}
    >
      {/* Tło klikalne */}
      <div className="flex-1" onClick={handleClose} />

      {/* Natywna szuflada iOS / ActionSheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-sheet-title"
        className={`gtk-sheet-content w-full sm:max-w-lg mx-auto bg-white rounded-t-[28px] sm:rounded-[24px] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] border border-slate-100 flex flex-col max-h-[85vh] overflow-hidden ${
          isClosing ? "gtk-sheet-closing" : ""
        }`}
        style={{
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))",
          ...sheetStyle,
        }}
      >
        {/* Obszar przeciągania w dół (Swipe-down to dismiss) */}
        <div
          {...bindDragArea}
          className="w-full pt-3 pb-2 touch-none select-none cursor-grab active:cursor-grabbing flex justify-center"
        >
          <div className="w-12 h-1.5 bg-slate-300 rounded-full hover:bg-slate-400 transition" />
        </div>

        {/* Nagłówek wizualny */}
        <div className="px-5 pt-1 pb-4 border-b border-slate-100 flex items-start justify-between">
          <div className="space-y-1 pr-3 flex-1" {...bindDragArea}>
            <div className="flex items-center gap-2">
              <h2 id="action-sheet-title" className="text-lg font-bold text-slate-900 leading-snug">
                {spot.name || "Koperta parkingowa"}
              </h2>
            </div>
            {spot.address && (
              <p className="text-xs text-slate-500 font-medium">{spot.address}</p>
            )}
            <div className="pt-1">{getStatusBadge()}</div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Zamknij"
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 hover:bg-slate-200 flex items-center justify-center font-bold text-xs transition shrink-0 ml-2 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
          >
            ✕
          </button>
        </div>

        {/* Treść karty */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Szybkie metadane */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
            <div>
              <span className="text-slate-400 font-medium block">Liczba miejsc</span>
              <strong className="text-slate-900 text-sm font-bold">
                {spot.slotsCount ? `${spot.slotsCount} stan.` : "1 stanowisko"}
              </strong>
            </div>
            <div>
              <span className="text-slate-400 font-medium block">Odległość piesza</span>
              <strong className="text-sky-600 text-sm font-bold">
                {spot.distanceMeters !== undefined ? `${Math.round(spot.distanceMeters)} m od celu` : "W pobliżu"}
              </strong>
            </div>
          </div>

          {/* Podgląd zdjęcia */}
          {spot.photoUrl && (
            <div className="rounded-2xl overflow-hidden border border-slate-100 aspect-video relative shadow-sm">
              <img src={spot.photoUrl} alt="Zdjęcie koperty" className="w-full h-full object-cover" />
            </div>
          )}

          {/* KARTA WERYFIKACJI W STYLU YANOSIKA */}
          {isGov ? (
            <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-lg shrink-0 shadow-sm">
                  🏛️
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-emerald-950">Zweryfikowano urzędowo</div>
                  <div className="text-[11px] text-emerald-700 font-medium truncate">
                    Oficjalny rejestr: {authorityName}
                  </div>
                </div>
              </div>
            </div>
          ) : isGtkCommunity ? (
            <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-lg shrink-0 shadow-sm">
                  🛡️
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-emerald-950">Zatwierdzone przez GTK</div>
                  <div className="text-[11px] text-emerald-700 font-medium truncate">
                    Zweryfikowane zgłoszenie w systemie GTK
                  </div>
                </div>
              </div>
            </div>
          ) : isOsmConfirmed ? (
            <div className="bg-sky-50/90 border border-sky-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center font-black text-lg shrink-0 shadow-sm">
                  🗺️
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-sky-950 flex items-center gap-1.5 flex-wrap">
                    <span>Miejsce z OSM</span>
                    {hasConfirmed && (
                      <span className="text-[10px] bg-sky-200 text-sky-900 font-bold px-1.5 py-0.5 rounded-md">
                        Potwierdziłeś 👍
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-sky-700 font-medium truncate">
                    Potwierdzone przez: {confirmationsCount} {confirmationsCount === 1 ? "kierowcę" : "kierowców"}
                  </div>
                </div>
              </div>

              {!hasConfirmed && (
                <button
                  type="button"
                  onClick={handleConfirmPresent}
                  aria-label="Potwierdź obecność koperty"
                  className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-bold text-xs shadow-sm transition active:scale-95 shrink-0"
                >
                  👍 Potwierdź
                </button>
              )}
            </div>
          ) : (
            <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3.5 space-y-2.5 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-lg shrink-0 shadow-sm">
                  ⚠️
                </div>
                <div>
                  <h3 className="text-xs font-bold text-amber-950">Miejsce z OpenStreetMap</h3>
                  <p className="text-[11px] text-amber-800">
                    Brak potwierdzenia od kierowców. Jesteś na miejscu?
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleConfirmPresent}
                className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.99]"
              >
                <span>👍</span>
                <span>Potwierdź obecność miejsca</span>
              </button>
            </div>
          )}

          {/* Notatki o miejscu */}
          {spot.notes && (
            <div className="p-3 bg-sky-50/70 border border-sky-100 rounded-xl text-xs text-sky-950">
              <span className="font-semibold block mb-0.5 text-sky-900">Wskazówki / opis:</span>
              <p>{spot.notes}</p>
            </div>
          )}

          {/* GŁÓWNY PRZYCISK NAWIGACJI (Jedno kliknięcie) */}
          <div className="space-y-2">
            <a
              href={primaryApp.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Uruchom nawigację do miejsca w aplikacji ${primaryApp.name}`}
              className="w-full py-3.5 px-5 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm shadow-lg shadow-sky-600/25 flex items-center justify-between transition transform active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
            >
              <div className="flex items-center gap-2.5">
                <svg className="w-5 h-5 text-sky-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                <span>Nawiguj w {primaryApp.name}</span>
              </div>
              <span className="text-xs font-semibold bg-white/20 px-2.5 py-1 rounded-full" aria-hidden="true">
                Otwórz ➔
              </span>
            </a>

            {/* Alternatywne aplikacje (Yanosik, Waze, Google) */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              {navApps
                .filter((app) => app.id !== primaryApp.id && app.id !== "geo")
                .slice(0, 3)
                .map((app) => (
                  <a
                    key={app.id}
                    href={app.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Otwórz nawigację w aplikacji ${app.name}`}
                    className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition text-center flex flex-col items-center justify-center gap-1 group shadow-sm focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
                  >
                    <span className="text-xs font-bold text-slate-800 group-hover:text-sky-600">
                      {app.name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium truncate max-w-full">
                      {app.badge || "Otwórz"}
                    </span>
                  </a>
                ))}
            </div>

            {/* Przycisk natywnego udostępniania systemowego */}
            {typeof navigator !== "undefined" && Boolean((navigator as any).share) && (
              <button
                type="button"
                onClick={handleNativeShare}
                aria-label="Udostępnij współrzędne miejsca w innej aplikacji na telefonie"
                className="w-full py-2.5 text-center text-xs font-semibold text-slate-500 hover:text-slate-800 transition flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none rounded-xl"
              >
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span>Wybierz inną aplikację na telefonie (Udostępnij)</span>
              </button>
            )}
          </div>

          {/* Zgłoszenie problemu z kopertą */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Coś się nie zgadza?</span>
            <button
              type="button"
              onClick={() => onReportIssue?.(spot)}
              aria-label="Zgłoś brak miejsca lub problem z tą kopertą"
              className="px-2.5 py-1.5 rounded-xl bg-slate-50 text-slate-700 hover:bg-amber-50 hover:text-amber-800 font-semibold border border-slate-200 hover:border-amber-200 transition flex items-center gap-1.5 active:scale-95 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
            >
              <span aria-hidden="true">⚠️</span>
              <span>Zgłoś brak miejsca</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
