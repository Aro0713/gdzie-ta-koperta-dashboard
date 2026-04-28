"use client";

import { useEffect, useRef, useState } from "react";
import { appConfig } from "@/lib/appConfig";
import { demoSpots, statusLabels } from "@/lib/demoSpots";

type LeafletModule = typeof import("leaflet");

export function KopertyMap({ full = false }: { full?: boolean }) {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const leafletMap = useRef<import("leaflet").Map | null>(null);
  const leafletApi = useRef<LeafletModule | null>(null);
  const userMarker = useRef<import("leaflet").Marker | null>(null);
  const [locationMessage, setLocationMessage] = useState("Mapa demo: Warszawa");

  useEffect(() => {
    let mounted = true;

    async function loadMap() {
      const L = await import("leaflet");
      leafletApi.current = L;

      if (!mounted || !mapNode.current || leafletMap.current) return;

      const map = L.map(mapNode.current, {
        zoomControl: full,
        scrollWheelZoom: full,
        attributionControl: true
      }).setView(
        [appConfig.defaultCenter.lat, appConfig.defaultCenter.lng],
        appConfig.defaultCenter.zoom
      );

      leafletMap.current = map;

      L.tileLayer(appConfig.tileUrl, {
        attribution: appConfig.tileAttribution,
        maxZoom: 19
      }).addTo(map);

      demoSpots.forEach((spot) => {
        const icon = L.divIcon({
          className: `koperta-marker marker-${spot.status}`,
          html: "<span>♿</span>",
          iconSize: [36, 36],
          iconAnchor: [18, 18]
        });

        const popup = `
          <strong>${spot.name}</strong><br />
          ${spot.address}<br />
          Status: ${statusLabels[spot.status]}<br />
          Miejsca: ${spot.slots}<br />
          Ostatnia weryfikacja: ${spot.lastVerified}
        `;

        L.marker([spot.lat, spot.lng], { icon }).addTo(map).bindPopup(popup);
      });
    }

    loadMap();

    return () => {
      mounted = false;

      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, [full]);

  function locateUser() {
    if (!navigator.geolocation) {
      setLocationMessage("Twoja przeglądarka nie obsługuje geolokalizacji.");
      return;
    }

    setLocationMessage("Sprawdzam lokalizację…");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const map = leafletMap.current;
        const L = leafletApi.current;

        if (!map || !L) return;

        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        map.setView([lat, lng], 15);

        if (userMarker.current) {
          userMarker.current.setLatLng([lat, lng]);
        } else {
          const userIcon = L.divIcon({
            className: "user-marker",
            html: "<span>●</span>",
            iconSize: [26, 26],
            iconAnchor: [13, 13]
          });

          userMarker.current = L.marker([lat, lng], { icon: userIcon })
            .addTo(map)
            .bindPopup("Twoja lokalizacja");
        }

        setLocationMessage(
          "Lokalizacja znaleziona. Teraz można szukać najbliższej koperty."
        );
      },
      () => {
        setLocationMessage(
          "Nie udało się pobrać lokalizacji. Sprawdź zgodę w przeglądarce."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000
      }
    );
  }

  return (
    <div className={`map-shell ${full ? "map-shell-full" : ""}`}>
      <div ref={mapNode} className="map-node" aria-label="Mapa kopert" />

      <div className="map-toolbar">
        <button className="secondary-button" onClick={locateUser} type="button">
          Pokaż moją lokalizację
        </button>
        <span>{locationMessage}</span>
      </div>
    </div>
  );
}
