"use client";

import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface AdminMiniMapProps {
  lat: number;
  lng: number;
  isEditMode: boolean;
  onCoordsChange: (coords: { lat: number; lng: number }) => void;
}

export default function AdminMiniMap({
  lat,
  lng,
  isEditMode,
  onCoordsChange,
}: AdminMiniMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const isEditModeRef = useRef(isEditMode);

  const [mapType, setMapType] = useState<"streets" | "satellite">("streets");

  // Synchronizacja refa trybu edycji
  useEffect(() => {
    isEditModeRef.current = isEditMode;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.getContainer().style.cursor = isEditMode ? "crosshair" : "";
    }
  }, [isEditMode]);

  // Pomocnik tworzenia ikony Leaflet
  const createMarkerIcon = (isEdit: boolean) => {
    const pinColor = isEdit ? "#f59e0b" : "#0284c7";
    const iconHtml = `
      <div style="position: relative; width: 36px; height: 46px; display: flex; flex-direction: column; align-items: center; cursor: ${isEdit ? "grab" : "pointer"};">
        <div style="
          width: 34px;
          height: 34px;
          background: ${pinColor};
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 4px 12px rgba(0,0,0,0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-size: 16px;
          font-weight: bold;
          position: relative;
          z-index: 2;
        ">
          ${isEdit ? "✏️" : "♿"}
          ${
            isEdit
              ? '<span style="position: absolute; top: -2px; right: -2px; width: 10px; height: 10px; background: #10b981; border: 2px solid #fff; border-radius: 50%;"></span>'
              : ""
          }
        </div>
        <div style="
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 10px solid ${pinColor};
          margin-top: -3px;
          filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3));
          position: relative;
          z-index: 1;
        "></div>
        <div style="
          position: absolute;
          bottom: -4px;
          width: 14px;
          height: 5px;
          background: rgba(0,0,0,0.35);
          border-radius: 50%;
          filter: blur(1px);
        "></div>
      </div>
    `;

    return L.divIcon({
      className: "gtk-admin-marker",
      html: iconHtml,
      iconSize: [36, 46],
      iconAnchor: [18, 41],
    });
  };

  // Inicjalizacja mapy Leaflet
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const validLat = Number.isFinite(lat) && lat !== 0 ? lat : 52.2297;
      const validLng = Number.isFinite(lng) && lng !== 0 ? lng : 21.0122;

      const map = L.map(mapContainerRef.current, {
        center: [validLat, validLng],
        zoom: 18,
        zoomControl: true,
        attributionControl: false,
      });

      const initialUrl =
        mapType === "satellite"
          ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          : process.env.NEXT_PUBLIC_TILE_URL ||
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

      const tileLayer = L.tileLayer(initialUrl, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      tileLayerRef.current = tileLayer;
      mapInstanceRef.current = map;

      // Utworzenie markera od razu przy starcie mapy
      const initialIcon = createMarkerIcon(isEditModeRef.current);
      const marker = L.marker([validLat, validLng], {
        icon: initialIcon,
        draggable: isEditModeRef.current,
      }).addTo(map);

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onCoordsChange({
          lat: Number(pos.lat.toFixed(6)),
          lng: Number(pos.lng.toFixed(6)),
        });
      });

      markerRef.current = marker;

      // Kliknięcie w mapę - tylko gdy tryb edycji jest aktywny!
      map.on("click", (e: L.LeafletMouseEvent) => {
        if (!isEditModeRef.current) return;
        const newPos = e.latlng;
        const newLat = Number(newPos.lat.toFixed(6));
        const newLng = Number(newPos.lng.toFixed(6));

        if (markerRef.current) {
          markerRef.current.setLatLng([newLat, newLng]);
        }
        onCoordsChange({ lat: newLat, lng: newLng });
      });

      // ResizeObserver do automatycznego odświeżania rozmiaru kafelków Leaflet
      const resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      });
      resizeObserver.observe(mapContainerRef.current);

      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
          mapInstanceRef.current.setView([validLat, validLng], 18);
        }
      }, 200);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  // Przełączanie warstwy: Ulice vs Satelita
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;

    const map = mapInstanceRef.current;
    map.removeLayer(tileLayerRef.current);

    const newUrl =
      mapType === "satellite"
        ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        : process.env.NEXT_PUBLIC_TILE_URL ||
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

    const newLayer = L.tileLayer(newUrl, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    tileLayerRef.current = newLayer;
  }, [mapType]);

  // Aktualizacja pozycji kamery i markera przy zmianie lat/lng/isEditMode
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const map = mapInstanceRef.current;
    map.invalidateSize();
    map.setView([lat, lng], map.getZoom() || 18);

    const newIcon = createMarkerIcon(isEditMode);

    if (!markerRef.current) {
      const marker = L.marker([lat, lng], {
        icon: newIcon,
        draggable: isEditMode,
      }).addTo(map);

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onCoordsChange({
          lat: Number(pos.lat.toFixed(6)),
          lng: Number(pos.lng.toFixed(6)),
        });
      });

      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng([lat, lng]);
      markerRef.current.setIcon(newIcon);
      if (isEditMode) {
        markerRef.current.dragging?.enable();
      } else {
        markerRef.current.dragging?.disable();
      }
    }
  }, [lat, lng, isEditMode]);

  const handleCenter = () => {
    if (mapInstanceRef.current && Number.isFinite(lat) && Number.isFinite(lng)) {
      mapInstanceRef.current.flyTo([lat, lng], 18, { duration: 0.6 });
    }
  };

  return (
    <div
      role="region"
      aria-label="Interaktywna minimapa pozycji koperty"
      className="relative w-full h-full rounded-xl overflow-hidden border border-slate-700/80 shadow-inner group"
    >
      <div ref={mapContainerRef} className="w-full h-full min-h-[260px]" />

      {/* Górny lewy pasek: Status blokady i wskazówka */}
      <div className="absolute top-2 left-2 z-[400]">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold shadow backdrop-blur-md transition ${
            isEditMode
              ? "bg-amber-500/95 text-amber-950 border border-amber-300 ring-2 ring-amber-400/50"
              : "bg-slate-900/85 text-slate-200 border border-slate-700"
          }`}
        >
          {isEditMode
            ? "✏️ Edycja: kliknij na mapie lub przeciągnij pinezkę"
            : "🔒 Pozycja zablokowana (kliknij [E] aby edytować)"}
        </span>
      </div>

      {/* Górny prawy pasek: Przełącznik Satelita / Ulice oraz Centrowanie */}
      <div className="absolute top-2 right-2 z-[400] flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1 rounded-lg border border-slate-700 shadow text-xs">
        <button
          type="button"
          onClick={() => setMapType(mapType === "streets" ? "satellite" : "streets")}
          aria-label={mapType === "streets" ? "Przełącz na widok satelitarny" : "Przełącz na widok ulic"}
          className={`px-2 py-1 rounded font-semibold text-[11px] transition flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none ${
            mapType === "satellite"
              ? "bg-sky-600 text-white"
              : "bg-slate-800 hover:bg-slate-700 text-slate-200"
          }`}
          title="Przełącz widok satelitarny / mapę wektorową"
        >
          <span aria-hidden="true">{mapType === "streets" ? "🛰️" : "🗺️"}</span>
          <span>{mapType === "streets" ? "Satelita" : "Ulice"}</span>
        </button>

        <button
          type="button"
          onClick={handleCenter}
          aria-label="Wycentruj widok mapy na pinezce koperty"
          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-400 font-semibold text-[11px] transition focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none flex items-center gap-1"
          title="Wycentruj widok na pinezce koperty"
        >
          <span aria-hidden="true">📍</span>
          <span>Wycentruj</span>
        </button>
      </div>

      {/* Dolny pasek: Koordynaty podglądu */}
      <div className="absolute bottom-1 left-2 z-[400] pointer-events-none">
        <span className="text-[10px] font-mono font-bold bg-slate-900/85 backdrop-blur-sm text-slate-300 px-2 py-0.5 rounded border border-slate-800 shadow">
          GPS: {lat.toFixed(5)}, {lng.toFixed(5)}
        </span>
      </div>
    </div>
  );
}
