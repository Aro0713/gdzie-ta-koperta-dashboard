"use client";

import React, { useEffect, useState } from "react";
import { reverseGeocode } from "@/lib/photonGeocoding";

interface MapPointPickerProps {
  coords: { lat: number; lng: number } | null;
  onSetAsDestination: (dest: { lat: number; lng: number; name: string }) => void;
  onAddSpotHere: (coords: { lat: number; lng: number }) => void;
  onClose: () => void;
}

export function MapPointPicker({
  coords,
  onSetAsDestination,
  onAddSpotHere,
  onClose,
}: MapPointPickerProps) {
  const [address, setAddress] = useState<{ name: string; description: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!coords) {
      setAddress(null);
      return;
    }

    let isMounted = true;
    setLoading(true);

    reverseGeocode(coords.lat, coords.lng)
      .then((res) => {
        if (isMounted) setAddress(res);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [coords]);

  if (!coords) return null;

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200/90 p-4 animate-in fade-in slide-in-from-bottom-4 duration-200"
      style={{
        bottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 border border-sky-100 font-bold text-sm">
            📍
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-slate-900 truncate">
              {loading ? "Odczytywanie adresu..." : address?.name || "Wybrany punkt"}
            </h4>
            <p className="text-xs text-slate-500 truncate">
              {address?.description || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Zamknij podgląd wybranego punktu"
          className="text-slate-400 hover:text-slate-600 p-1 -mr-1 -mt-1 font-bold text-sm rounded-lg hover:bg-slate-100 transition focus-visible:ring-2 focus-visible:ring-sky-500"
          title="Zamknij"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            onSetAsDestination({
              lat: coords.lat,
              lng: coords.lng,
              name: address?.name || "Punkt z mapy",
            });
            onClose();
          }}
          aria-label={`Ustaw ${address?.name || "wybrany punkt"} jako cel podróży`}
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition active:scale-[0.98] shadow-sm focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
        >
          <span aria-hidden="true">🎯</span>
          <span>Ustaw jako cel</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onAddSpotHere(coords);
          }}
          aria-label="Zgłoś nową kopertę w tym wybranym punkcie"
          className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-semibold text-xs transition active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
        >
          <span aria-hidden="true">➕</span>
          <span>Zgłoś kopertę</span>
        </button>
      </div>
    </div>
  );
}
