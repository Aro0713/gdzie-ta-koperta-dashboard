"use client";

import React, { useState } from "react";
import type { SpotDetail } from "@/components/NavigationActionSheet";

interface NearbySpotsListProps {
  destination: { lat: number; lng: number; name: string } | null;
  spots: SpotDetail[];
  extraSpot?: SpotDetail | null;
  selectedSpotId?: string | null;
  onSelectSpot: (spot: SpotDetail) => void;
  onNavigateToSpot?: (spot: SpotDetail) => void;
  onClearDestination: () => void;
}

export function NearbySpotsList({
  destination,
  spots,
  extraSpot = null,
  selectedSpotId,
  onSelectSpot,
  onNavigateToSpot,
  onClearDestination,
}: NearbySpotsListProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!destination) return null;

  // Filtrujemy i sortujemy od najbliższej
  const sortedSpots = [...spots]
    .filter((s) => s.distanceMeters !== undefined && s.distanceMeters < 3500)
    .sort((a, b) => (a.distanceMeters || 0) - (b.distanceMeters || 0))
    .slice(0, 3);

  // Dodatkowa 4. koperta wybrana bezpośrednio z mapy
  const showExtraSpot = extraSpot && !sortedSpots.some((s) => s.id === extraSpot.id);

  return (
    <div className="w-full bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200 overflow-hidden transition-all duration-200">
      {/* Pasek nagłówka */}
      <div className="px-3.5 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          <span className="text-xs font-bold text-slate-800 truncate">
            Cel: {destination.name}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? "Rozwiń listę najbliższych kopert" : "Zwiń listę najbliższych kopert"}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-0.5 rounded hover:bg-slate-200/60 transition focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            {isCollapsed ? `Pokaż (${showExtraSpot ? 4 : sortedSpots.length})` : "Zwiń"}
          </button>
          <button
            type="button"
            onClick={onClearDestination}
            aria-label="Wyczyść wybrany cel podróży"
            className="text-xs text-slate-400 hover:text-slate-700 px-1 font-bold focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
            title="Wyczyść cel"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Lista 3 miejsc */}
      {!isCollapsed && (
        <div className="divide-y divide-slate-100 p-1">
          {sortedSpots.length === 0 ? (
            <div className="p-3.5 text-center text-xs text-slate-500">
              Nie znaleziono jeszcze zmapowanych kopert w promieniu 1 km.
              <br />
              <span className="text-sky-600 font-semibold cursor-pointer">
                Bądź pierwszy i dodaj miejsce!
              </span>
            </div>
          ) : (
            sortedSpots.map((spot, index) => {
              const isGov =
                spot.sourceType === "gov_official_wfs" ||
                Boolean(spot.authority) ||
                Boolean(
                  spot.externalId?.startsWith("gdansk_") ||
                  spot.externalId?.startsWith("wroclaw_") ||
                  spot.externalId?.startsWith("poznan_") ||
                  spot.externalId?.startsWith("gdynia_")
                );
              const isVerified =
                isGov ||
                spot.source === "gdzietakoperta" ||
                spot.status === "verified" ||
                spot.status === "gtk_community";
              const statusColor = isVerified
                ? "bg-emerald-600"
                : spot.status === "osm"
                ? "bg-sky-600"
                : "bg-amber-600";
              const isSelected = selectedSpotId === spot.id;
              const letters = ["A", "B", "C", "D"];
              const spotLetter = letters[index] || "A";

              return (
                <div
                  key={spot.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectSpot(spot)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectSpot(spot);
                    }
                  }}
                  aria-label={`Koperta ${spotLetter}: ${spot.address || spot.name || "Koperta parkingowa"}, ${spot.slotsCount ? spot.slotsCount + " stanowisk" : "1 stanowisko"}, odległość ${spot.distanceMeters !== undefined ? Math.round(spot.distanceMeters) + " metrów" : "w pobliżu"}${isSelected ? " - obecnie wybrana" : ""}`}
                  className={`w-full text-left px-3 py-2.5 transition cursor-pointer flex items-center justify-between gap-3 group rounded-xl focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none ${
                    isSelected
                      ? "bg-sky-50/95 border-2 border-sky-500 shadow-sm"
                      : "hover:bg-slate-50 active:bg-slate-100 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Litera i status z widocznym oznaczeniem A, B, C */}
                    <div
                      className={`w-7 h-7 rounded-lg ${statusColor} text-white flex items-center justify-center text-xs font-black shrink-0 shadow-sm transition-transform ${
                        isSelected ? "scale-110 ring-2 ring-sky-400" : ""
                      }`}
                    >
                      {spotLetter}
                    </div>

                    {/* Dane miejsca */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 truncate max-w-[190px]">
                          {spot.address || spot.name || "Koperta parkingowa"}
                        </span>
                        {isSelected && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-100/90 px-1.5 py-0.2 rounded-md">
                            Trasa 📍
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                        <span>{spot.slotsCount ? `${spot.slotsCount} stan.` : "1 stan."}</span>
                        <span>
                          {isGov
                            ? `• 🏛️ ${spot.authority || "Urzędowe"}`
                            : isVerified
                            ? spot.photoUrl
                              ? "• Zweryfikowana 📸"
                              : "• Społeczność 🛡️"
                            : "• OpenStreetMap"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Odległość i przycisk nawigacji */}
                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <div className="text-xs font-extrabold text-sky-800">
                      {spot.distanceMeters !== undefined
                        ? `${Math.round(spot.distanceMeters)} m`
                        : "w pobliżu"}
                    </div>
                    {isSelected && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onNavigateToSpot) {
                            onNavigateToSpot(spot);
                          } else {
                            onSelectSpot(spot);
                          }
                        }}
                        className="inline-flex items-center gap-1 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white text-[11px] font-bold px-2 py-0.5 rounded-lg shadow-sm transition active:scale-95"
                      >
                        <span>Nawiguj</span>
                        <span>➔</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Dodatkowa 4. koperta (D) wskazana bezpośrednio z mapy */}
          {showExtraSpot && (() => {
            const isGov =
              extraSpot.sourceType === "gov_official_wfs" ||
              Boolean(extraSpot.authority) ||
              Boolean(
                extraSpot.externalId?.startsWith("gdansk_") ||
                extraSpot.externalId?.startsWith("wroclaw_") ||
                extraSpot.externalId?.startsWith("poznan_") ||
                extraSpot.externalId?.startsWith("gdynia_")
              );
            const isVerified =
              isGov ||
              extraSpot.source === "gdzietakoperta" ||
              extraSpot.status === "verified" ||
              extraSpot.status === "gtk_community";
            const statusColor = isVerified
              ? "bg-emerald-600"
              : extraSpot.status === "osm"
              ? "bg-sky-600"
              : "bg-amber-600";

            return (
              <div
                key={extraSpot.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectSpot(extraSpot)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectSpot(extraSpot);
                  }
                }}
                aria-label={`Koperta D wybrana z mapy: ${extraSpot.address || extraSpot.name || "Koperta parkingowa"}, odległość ${extraSpot.distanceMeters !== undefined ? Math.round(extraSpot.distanceMeters) + " metrów" : "w pobliżu"}`}
                className="w-full text-left px-3 py-2.5 transition cursor-pointer flex items-center justify-between gap-3 group rounded-xl bg-sky-50/95 border-2 border-sky-500 shadow-sm"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Litera D */}
                  <div
                    className={`w-7 h-7 rounded-lg ${statusColor} text-white flex items-center justify-center text-xs font-black shrink-0 shadow-sm scale-110 ring-2 ring-sky-400`}
                  >
                    D
                  </div>

                  {/* Dane miejsca */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 truncate max-w-[170px]">
                        {extraSpot.address || extraSpot.name || "Koperta parkingowa"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-800 bg-sky-200/90 px-1.5 py-0.2 rounded-md">
                        Z mapy 📍
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                      <span>{extraSpot.slotsCount ? `${extraSpot.slotsCount} stan.` : "1 stan."}</span>
                      <span>
                        {isGov
                          ? `• 🏛️ ${extraSpot.authority || "Urzędowe"}`
                          : isVerified
                          ? extraSpot.photoUrl
                            ? "• Zweryfikowana 📸"
                            : "• Społeczność 🛡️"
                          : "• OpenStreetMap"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Odległość i przycisk nawigacji */}
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <div className="text-xs font-extrabold text-sky-800">
                    {extraSpot.distanceMeters !== undefined
                      ? `${Math.round(extraSpot.distanceMeters)} m`
                      : "w pobliżu"}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onNavigateToSpot) {
                        onNavigateToSpot(extraSpot);
                      } else {
                        onSelectSpot(extraSpot);
                      }
                    }}
                    className="inline-flex items-center gap-1 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white text-[11px] font-bold px-2 py-0.5 rounded-lg shadow-sm transition active:scale-95"
                  >
                    <span>Nawiguj</span>
                    <span>➔</span>
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
