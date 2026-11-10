"use client";

import React, { useEffect, useRef, useState } from "react";
import type { SpotDetail } from "@/components/NavigationActionSheet";

interface GtkMapProps {
  center: [number, number];
  zoom: number;
  userLocation: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number; name: string } | null;
  clickedPoint?: { lat: number; lng: number } | null;
  flyToTrigger?: { lat: number; lng: number; zoom?: number; timestamp: number } | null;
  topSpots?: SpotDetail[];
  selectedSpot?: SpotDetail | null;
  onSelectSpot: (spot: SpotDetail) => void;
  onSpotsLoaded?: (spots: SpotDetail[]) => void;
  onDestinationSpotsLoaded?: (spots: SpotDetail[]) => void;
  onMapClick?: (coords: { lat: number; lng: number }) => void;
}

export default function GtkMap({
  center,
  zoom,
  userLocation,
  destination,
  clickedPoint,
  flyToTrigger,
  topSpots = [],
  selectedSpot = null,
  onSelectSpot,
  onSpotsLoaded,
  onDestinationSpotsLoaded,
  onMapClick
}: GtkMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const leafletApiRef = useRef<any>(null);
  const clusterGroupRef = useRef<any>(null);
  const topSpotsLayerRef = useRef<any>(null);
  const walkingRouteLayerRef = useRef<any>(null);
  const destinationMarkerRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const clickedMarkerRef = useRef<any>(null);
  const activeRouteRequestIdRef = useRef<number>(0);
  const allSpotsDataRef = useRef<SpotDetail[]>([]);
  const [loading, setLoading] = useState(false);

  const destinationRef = useRef(destination);
  destinationRef.current = destination;

  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;

  const topSpotsRef = useRef(topSpots);
  topSpotsRef.current = topSpots;

  const selectedSpotRef = useRef(selectedSpot);
  selectedSpotRef.current = selectedSpot;

  const onSelectSpotRef = useRef(onSelectSpot);
  onSelectSpotRef.current = onSelectSpot;

  const onSpotsLoadedRef = useRef(onSpotsLoaded);
  onSpotsLoadedRef.current = onSpotsLoaded;

  const onDestinationSpotsLoadedRef = useRef(onDestinationSpotsLoaded);
  onDestinationSpotsLoadedRef.current = onDestinationSpotsLoaded;

  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  const lastQueryCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const activeSpotsRequestIdRef = useRef<number>(0);

  // Inicjalizacja Leaflet z pełną odpornością na React StrictMode
  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapContainerRef.current) return;

      const leafletModule = await import("leaflet");
      const L = leafletModule.default || leafletModule;

      if (typeof window !== "undefined") {
        (window as any).L = L;
      }

      try {
        await import("leaflet.markercluster");
      } catch (err) {
        console.warn("MarkerCluster plugin load error:", err);
      }

      const activeL = (typeof window !== "undefined" && (window as any).L) ? (window as any).L : L;

      // Zabezpieczenie przed podwójnym renderem w React StrictMode
      if (!isMounted || !mapContainerRef.current || mapInstanceRef.current) {
        return;
      }

      // Czyszczenie starego ID kontenera Leaflet jeśli istniał
      if ((mapContainerRef.current as any)._leaflet_id) {
        delete (mapContainerRef.current as any)._leaflet_id;
      }

      leafletApiRef.current = activeL;

      // Naprawa ikon Leaflet
      delete (activeL.Icon.Default.prototype as any)._getIconUrl;
      activeL.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = activeL.map(mapContainerRef.current, {
        center: center,
        zoom: zoom,
        zoomControl: false,
        attributionControl: false,
      });

      // Kontrolka zoomu
      activeL.control.zoom({ position: "bottomright" }).addTo(map);

      // Kafelki mapy OpenStreetMap / CartoDB Voyager
      activeL.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Grupa klastrów z precyzyjnym schematem grupowania w zależności od zoomu
      const clusterGroup = typeof activeL.markerClusterGroup === "function"
        ? activeL.markerClusterGroup({
            showCoverageOnHover: false,
            spiderfyOnMaxZoom: true,
            zoomToBoundsOnClick: true,
            spiderfyDistanceMultiplier: 1.5,
            maxClusterRadius: (zoom: number) => {
              if (zoom >= 17) return 25;
              if (zoom >= 15) return 40;
              return 55;
            },
            disableClusteringAtZoom: 18,
          })
        : activeL.layerGroup();
      map.addLayer(clusterGroup);

      clusterGroupRef.current = clusterGroup;

      // Dedykowana warstwa dla animowanej trasy pieszej (Hybryda)
      const walkingRouteLayer = activeL.layerGroup();
      map.addLayer(walkingRouteLayer);
      walkingRouteLayerRef.current = walkingRouteLayer;

      // Dedykowana warstwa dla 3 najbliższych kopert (#1, #2, #3 poza klastrami)
      const topSpotsLayer = activeL.layerGroup();
      map.addLayer(topSpotsLayer);
      topSpotsLayerRef.current = topSpotsLayer;

      mapInstanceRef.current = map;

      // Natychmiastowe narysowanie kropki GPS użytkownika jeśli lokalizacja jest już znana
      if (userLocationRef.current) {
        renderUserMarker(userLocationRef.current);
      }

      // Wymuś prawidłowe wymiary
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 100);

      map.on("click", (e: any) => {
        if (e?.originalEvent?.defaultPrevented) return;
        onMapClickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
      });

      // Początkowe załadowanie punktów
      loadNearbySpots(center[0], center[1], 3000);

      map.on("moveend", () => {
        const c = map.getCenter();
        loadNearbySpots(c.lat, c.lng, 3000);
      });
    }

    initMap();

    return () => {
      isMounted = false;
      if (walkingRouteLayerRef.current) {
        walkingRouteLayerRef.current.clearLayers();
        walkingRouteLayerRef.current = null;
      }
      if (topSpotsLayerRef.current) {
        topSpotsLayerRef.current.clearLayers();
        topSpotsLayerRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
        delete (mapContainerRef.current as any)._leaflet_id;
      }
    };
  }, []);

  // Aktualizacja centrum (statyczna gdy brak aktywnego lotu)
  useEffect(() => {
    if (mapInstanceRef.current && !flyToTrigger) {
      mapInstanceRef.current.setView(center, zoom);
      loadNearbySpots(center[0], center[1], 3000);
    }
  }, [center[0], center[1], zoom]);

  // Płynny lot kamery wywoływany akcją (np. kliknięcie Moja Pozycja lub cel podróży)
  useEffect(() => {
    if (!mapInstanceRef.current || !flyToTrigger) return;
    const targetZoom = flyToTrigger.zoom ?? 16.5;

    try {
      mapInstanceRef.current.stop();
    } catch {}

    mapInstanceRef.current.flyTo([flyToTrigger.lat, flyToTrigger.lng], targetZoom, {
      duration: 1.0,
      easeLinearity: 0.25,
    });
    loadNearbySpots(flyToTrigger.lat, flyToTrigger.lng, 3000);
  }, [flyToTrigger]);

  // Funkcja renderująca kropkę lokalizacji użytkownika (Google Maps style)
  function renderUserMarker(loc: { lat: number; lng: number } | null) {
    const L = leafletApiRef.current;
    const map = mapInstanceRef.current;
    if (!map || !L || !loc || typeof loc.lat !== "number" || typeof loc.lng !== "number") return;

    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }

    const userIcon = L.divIcon({
      className: "user-gps-beacon",
      html: `
        <div style="position: relative; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 44px; height: 44px; background: rgba(2, 132, 199, 0.25); border-radius: 9999px;"></div>
          <div style="width: 18px; height: 18px; background: #0284c7; border: 3px solid #ffffff; border-radius: 9999px; box-shadow: 0 2px 8px rgba(0,0,0,0.35);"></div>
        </div>
      `,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    const marker = L.marker([loc.lat, loc.lng], {
      icon: userIcon,
      zIndexOffset: 1000,
    }).addTo(map);

    userMarkerRef.current = marker;
  }

  // Aktualizacja znacznika użytkownika gdy lokalizacja się zmienia
  useEffect(() => {
    if (userLocation) {
      renderUserMarker(userLocation);
    }
  }, [userLocation]);

  // Znacznik klikniętego punktu na mapie
  useEffect(() => {
    const L = leafletApiRef.current;
    if (!mapInstanceRef.current || !L) return;

    if (clickedMarkerRef.current) {
      mapInstanceRef.current.removeLayer(clickedMarkerRef.current);
      clickedMarkerRef.current = null;
    }

    if (clickedPoint) {
      const pinIcon = L.divIcon({
        className: "clicked-point-pin",
        html: `
          <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 36px; height: 36px; background: rgba(245, 158, 11, 0.3); border-radius: 9999px; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="width: 26px; height: 26px; background: #f59e0b; border: 2.5px solid #ffffff; border-radius: 9999px; box-shadow: 0 3px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 13px; font-weight: bold;">
              📍
            </div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([clickedPoint.lat, clickedPoint.lng], {
        icon: pinIcon,
        zIndexOffset: 900,
      }).addTo(mapInstanceRef.current);

      clickedMarkerRef.current = marker;
    }
  }, [clickedPoint]);

  // Znacznik celu podróży
  useEffect(() => {
    const L = leafletApiRef.current;
    if (!mapInstanceRef.current || !L) return;

    if (destinationMarkerRef.current) {
      mapInstanceRef.current.removeLayer(destinationMarkerRef.current);
      destinationMarkerRef.current = null;
    }

    if (destination) {
      const destIcon = L.divIcon({
        className: "dest-target-pin",
        html: `
          <div style="display: flex; align-items: center; gap: 6px; background: #0f172a; color: #ffffff; padding: 6px 12px; border-radius: 10px; font-size: 11px; font-weight: 700; box-shadow: 0 4px 14px rgba(0,0,0,0.25); border: 1.5px solid rgba(255,255,255,0.4);">
            <span style="display: inline-block; width: 8px; height: 8px; background: #ef4444; border-radius: 50%;"></span>
            <span style="white-space: nowrap; max-width: 140px; overflow: hidden; text-overflow: ellipsis;">${destination.name}</span>
          </div>
        `,
        iconSize: [150, 32],
        iconAnchor: [75, 16],
      });

      const marker = L.marker([destination.lat, destination.lng], { icon: destIcon })
        .addTo(mapInstanceRef.current);

      destinationMarkerRef.current = marker;
      loadNearbySpots(destination.lat, destination.lng, 3000, true);
    }
  }, [destination]);

  // Funkcja odświeżająca znaczniki na mapie:
  // - Top 3 oraz aktywna 4. koperta trafiają do dedykowanej warstwy (1, 2, 3, 4 z animacjami i wysokim z-index)
  // - Pozostałe punkty trafiają do klastra ze standardowymi ikonami (bez dublowania!)
  function refreshAllMapMarkers() {
    const L = leafletApiRef.current;
    const map = mapInstanceRef.current;
    const clusterGroup = clusterGroupRef.current;
    const topLayer = topSpotsLayerRef.current;
    if (!map || !L || !clusterGroup || !topLayer) return;

    clusterGroup.clearLayers();
    topLayer.clearLayers();

    const allSpots = allSpotsDataRef.current || [];
    const dest = destinationRef.current;
    const currentTopSpots = (topSpotsRef.current || []).slice(0, 3);
    const selected = selectedSpotRef.current;

    if (dest) {
      const isSelectedInTop3 = currentTopSpots.some((s) => s.id === selected?.id);
      const extraSpot = !isSelectedInTop3 && selected ? selected : null;
      const topAndExtra = extraSpot ? [...currentTopSpots, extraSpot] : currentTopSpots;
      const topAndExtraIds = new Set(topAndExtra.map((s) => s.id));

      // 1. Renderowanie kopert A, B, C oraz ewentualnej D w dedykowanej warstwie
      topAndExtra.forEach((spot, idx) => {
        const isSelected = selected?.id === spot.id;
        const isVerified =
          spot.sourceType === "gov_official_wfs" ||
          Boolean(spot.authority) ||
          Boolean(
            spot.externalId?.startsWith("gdansk_") ||
            spot.externalId?.startsWith("wroclaw_") ||
            spot.externalId?.startsWith("poznan_") ||
            spot.externalId?.startsWith("gdynia_")
          ) ||
          spot.source === "gdzietakoperta" ||
          spot.status === "verified" ||
          spot.status === "gtk_community";
        const bgColor = isVerified ? "#059669" : spot.status === "osm" ? "#0284c7" : "#d97706";
        const size = isSelected ? 42 : 36;
        const isExtra = Boolean(extraSpot && spot.id === extraSpot.id);
        const letter = isExtra ? "D" : ["A", "B", "C"][idx] || "A";

        const iconHtml = `
          <div style="position: relative; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            ${
              isSelected
                ? `<div style="position: absolute; inset: -9px; border-radius: 9999px; background: rgba(2, 132, 199, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite; pointer-events: none;"></div>`
                : ""
            }
            <div style="
              width: ${size}px;
              height: ${size}px;
              background: ${bgColor};
              border: ${isSelected ? "3px solid #ffffff" : "2.5px solid #ffffff"};
              border-radius: 10px;
              box-shadow: ${
                isSelected
                  ? "0 0 0 3px #0284c7, 0 10px 25px rgba(0,0,0,0.4)"
                  : "0 4px 12px rgba(0,0,0,0.3)"
              };
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-family: inherit;
              position: relative;
              transform: ${isSelected ? "scale(1.15)" : "scale(1)"};
              transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            ">
              <span style="font-size: ${isSelected ? "17px" : "14px"}; font-weight: 900; letter-spacing: -0.5px;">${letter}</span>
              <span style="position: absolute; bottom: -5px; right: -5px; background: #0f172a; color: white; border: 1.5px solid white; border-radius: 9999px; width: 16px; height: 16px; font-size: 9px; font-weight: bold; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.25);">♿</span>
            </div>
          </div>
        `;

        const icon = L.divIcon({
          className: "gtk-top-pin",
          html: iconHtml,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        const marker = L.marker([spot.lat, spot.lng], {
          icon,
          zIndexOffset: isSelected ? 3500 : 2500 - idx * 20,
        });

        marker.on("click", (e: any) => {
          if (L?.DomEvent) L.DomEvent.stopPropagation(e);
          if (e?.originalEvent) {
            e.originalEvent.stopPropagation?.();
            e.originalEvent.preventDefault?.();
          }
          onSelectSpotRef.current?.(spot);
        });

        topLayer.addLayer(marker);
      });

      // 2. Renderowanie pozostałych punktów w klastrze (bez duplikowania punktów z topAndExtra)
      allSpots.forEach((spot) => {
        if (topAndExtraIds.has(spot.id)) return;

        const isVerified =
          spot.sourceType === "gov_official_wfs" ||
          Boolean(spot.authority) ||
          Boolean(
            spot.externalId?.startsWith("gdansk_") ||
            spot.externalId?.startsWith("wroclaw_") ||
            spot.externalId?.startsWith("poznan_") ||
            spot.externalId?.startsWith("gdynia_")
          ) ||
          spot.source === "gdzietakoperta" ||
          spot.status === "verified" ||
          spot.status === "gtk_community";
        const bgColor = isVerified ? "#059669" : spot.status === "osm" ? "#0284c7" : "#d97706";
        const labelText = spot.status === "general_parking" ? "P" : "♿";

        const customIcon = L.divIcon({
          className: "gtk-map-pin",
          html: `
            <div style="background: ${bgColor}; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; font-weight: 800; border: 2px solid ${isVerified ? '#6ee7b7' : 'white'}; box-shadow: 0 4px 12px rgba(0,0,0,0.25); cursor: pointer; position: relative;">
              ${labelText}
              ${isVerified ? '<span style="position: absolute; top: -4px; right: -4px; width: 10px; height: 10px; background: #10b981; border: 1.5px solid white; border-radius: 9999px;"></span>' : ''}
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker([spot.lat, spot.lng], { icon: customIcon });
        marker.on("click", (e: any) => {
          if (L?.DomEvent) L.DomEvent.stopPropagation(e);
          if (e?.originalEvent) {
            e.originalEvent.stopPropagation?.();
            e.originalEvent.preventDefault?.();
          }
          onSelectSpotRef.current?.(spot);
        });

        clusterGroup.addLayer(marker);
      });
    } else {
      // Brak celu: standardowe ikony w klastrach dla wszystkich
      allSpots.forEach((spot) => {
        const isVerified =
          spot.sourceType === "gov_official_wfs" ||
          Boolean(spot.authority) ||
          Boolean(
            spot.externalId?.startsWith("gdansk_") ||
            spot.externalId?.startsWith("wroclaw_") ||
            spot.externalId?.startsWith("poznan_") ||
            spot.externalId?.startsWith("gdynia_")
          ) ||
          spot.source === "gdzietakoperta" ||
          spot.status === "verified" ||
          spot.status === "gtk_community";
        const bgColor = isVerified ? "#059669" : spot.status === "osm" ? "#0284c7" : "#d97706";
        const labelText = spot.status === "general_parking" ? "P" : "♿";

        const customIcon = L.divIcon({
          className: "gtk-map-pin",
          html: `
            <div style="background: ${bgColor}; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; font-weight: 800; border: 2px solid ${isVerified ? '#6ee7b7' : 'white'}; box-shadow: 0 4px 12px rgba(0,0,0,0.25); cursor: pointer; position: relative;">
              ${labelText}
              ${isVerified ? '<span style="position: absolute; top: -4px; right: -4px; width: 10px; height: 10px; background: #10b981; border: 1.5px solid white; border-radius: 9999px;"></span>' : ''}
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker([spot.lat, spot.lng], { icon: customIcon });
        marker.on("click", (e: any) => {
          if (L?.DomEvent) L.DomEvent.stopPropagation(e);
          if (e?.originalEvent) {
            e.originalEvent.stopPropagation?.();
            e.originalEvent.preventDefault?.();
          }
          onSelectSpotRef.current?.(spot);
        });

        clusterGroup.addLayer(marker);
      });
    }
  }

  // Funkcja renderująca trasę pieszą dojścia do wybranej koperty (Hybryda: beeline 0ms + OSRM foot routing)
  // Rysowana WYŁĄCZNIE gdy ustawiony jest cel podróży (destination)
  function renderWalkingRoute() {
    const L = leafletApiRef.current;
    const map = mapInstanceRef.current;
    const layer = walkingRouteLayerRef.current;
    if (!map || !L || !layer) return;

    layer.clearLayers();

    const activeSelected = selectedSpotRef.current;
    if (!activeSelected) return;

    // Trasa piesza jest wyznaczana TYLKO dla celu podróży (nie z bieżącego GPS bez celu)
    const origin = destinationRef.current;
    if (!origin || typeof origin.lat !== "number" || typeof origin.lng !== "number") return;

    const originCoords: [number, number] = [origin.lat, origin.lng];
    const spotCoords: [number, number] = [activeSelected.lat, activeSelected.lng];

    const beelineMeters = Math.round(
      getDistanceMeters(originCoords[0], originCoords[1], spotCoords[0], spotCoords[1])
    );
    const approxMinutes = Math.max(1, Math.ceil(beelineMeters / 75));

    // 1. Natychmiastowa animowana linia przerywana (0 ms)
    const walkingPolyline = L.polyline([originCoords, spotCoords], {
      color: "#0284c7",
      weight: 5,
      opacity: 0.9,
      dashArray: "8, 10",
      lineCap: "round",
      className: "walking-route-path",
    }).addTo(layer);

    walkingPolyline
      .bindTooltip(
        `<div class="gtk-walking-pill">🚶 <b>${beelineMeters} m</b> • ok. ${approxMinutes} min pieszo</div>`,
        {
          permanent: true,
          direction: "center",
          className: "walking-route-tooltip",
        }
      )
      .openTooltip();

    // 2. BEZ ZMIANY ZOOMU: Zachowujemy dokładnie taki poziom powiększenia, jaki ma użytkownik.
    // Jeśli wybrana koperta znajduje się poza aktualnym oknem mapy, delikatnie przesuwamy widok bez ruszania zoomu.
    if (map && !map.getBounds().contains([spotCoords[0], spotCoords[1]])) {
      map.panTo([spotCoords[0], spotCoords[1]], { animate: true, duration: 0.4 });
    }

    // 3. Asynchroniczne dociągnięcie trasy pieszej po chodnikach (Hybryda)
    const reqId = ++activeRouteRequestIdRef.current;
    fetch(
      `/api/route-walking?startLat=${originCoords[0]}&startLng=${originCoords[1]}&endLat=${spotCoords[0]}&endLng=${spotCoords[1]}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (reqId !== activeRouteRequestIdRef.current) return;
        if (data?.ok && Array.isArray(data.coordinates) && data.coordinates.length >= 2) {
          walkingPolyline.setLatLngs(data.coordinates);
          const dist = data.distanceMeters || beelineMeters;
          const dur = Math.max(
            1,
            Math.ceil((data.durationSeconds || beelineMeters / 1.2) / 60)
          );
          const mode = data.isFootRouting ? "chodnikiem" : "pieszo";

          walkingPolyline.setTooltipContent(
            `<div class="gtk-walking-pill">🚶 <b>${dist} m</b> • ${dur} min ${mode}</div>`
          );
        }
      })
      .catch(() => {
        // Fallback w linii prostej z szacunkiem odległości już jest wyświetlony
      });
  }

  // Reakcja na zmianę 3 najbliższych kopert, aktywnego miejsca lub celu
  useEffect(() => {
    refreshAllMapMarkers();
  }, [topSpots, selectedSpot, destination]);

  // Reakcja na zaznaczenie koperty lub zmianę celu (rysowanie linii trasy)
  useEffect(() => {
    renderWalkingRoute();
  }, [selectedSpot, destination]);

  // Pobieranie kopert
  async function loadNearbySpots(lat: number, lng: number, radius = 3000, isDestination = false) {
    const L = leafletApiRef.current;
    if (!L || !clusterGroupRef.current) return;

    // Unikamy zapętlenia zapytań jeśli mapa przesunęła się o mniej niż 250m od ostatniego punktu zapytania (chyba że to nowy cel podróży)
    if (!isDestination && lastQueryCenterRef.current) {
      const distFromLast = getDistanceMeters(
        lastQueryCenterRef.current.lat,
        lastQueryCenterRef.current.lng,
        lat,
        lng
      );
      if (distFromLast < 250) {
        return;
      }
    }
    lastQueryCenterRef.current = { lat, lng };

    const reqId = ++activeSpotsRequestIdRef.current;
    try {
      setLoading(true);
      const res = await fetch(`/api/osm/parking?lat=${lat}&lng=${lng}&radius=${radius}`);
      if (!res.ok) return;

      const data = await res.json();
      if (reqId !== activeSpotsRequestIdRef.current) return;
      if (!data?.features || !Array.isArray(data.features)) return;

      const loadedSpots: SpotDetail[] = [];

      // Punkt referencyjny dla odległości:
      // Zawsze cel (jeśli aktywny) LUB pozycja użytkownika (jeśli aktywna) LUB punkt zapytania
      const activeDest = destinationRef.current;
      const activeUser = userLocationRef.current;
      const refLat = activeDest ? activeDest.lat : (activeUser ? activeUser.lat : lat);
      const refLng = activeDest ? activeDest.lng : (activeUser ? activeUser.lng : lng);

      data.features.forEach((feature: any) => {
        const coords = feature.geometry?.coordinates;
        if (!coords || coords.length < 2) return;
        const [pLng, pLat] = coords;
        const p = feature.properties || {};

        const photoUrl = p.photoUrl || p.tags?.["photo:url"] || undefined;
        const isGtk = p.source === "gdzietakoperta" || p.isCommunitySpot === true;
        const isExactEnvelope = p.amenity === "parking_space" || p.parkingSpace === "disabled";

        const status: SpotDetail["status"] = isGtk
          ? (photoUrl ? "verified" : "gtk_community")
          : photoUrl
          ? "verified"
          : isExactEnvelope
          ? "osm"
          : "general_parking";

        const dist = getDistanceMeters(refLat, refLng, pLat, pLng);

        const rawVerifiedCount =
          typeof p.verifiedCount === "number"
            ? p.verifiedCount
            : typeof p.confirmations === "number"
            ? p.confirmations
            : 0;

        const spot: SpotDetail = {
          id: String(p.osmId || `${pLat}-${pLng}`),
          name: p.name || (isExactEnvelope ? "Koperta dla osób z niepełnosprawnością" : "Parking z miejscami dostępnymi"),
          lat: pLat,
          lng: pLng,
          address: p.address || p.street || (p.areaName ? `Okolice: ${p.areaName}` : undefined),
          status,
          source: isGtk ? "gdzietakoperta" : "osm",
          slotsCount: p.capacityDisabled || "1",
          photoUrl,
          notes: p.notes || p.tags?.description,
          verifiedCount: rawVerifiedCount,
          distanceMeters: dist,
          externalId: p.externalId || p.tags?.["gtk:external_id"] || null,
          confidenceScore: p.confidenceScore || (photoUrl ? 95 : isGtk ? 85 : 50),
          sourcesProvenance: p.sourcesProvenance || [],
          sourceType: p.sourceType || p.tags?.["gtk:source_type"] || null,
          authority: p.authority || (p.sourcesProvenance?.[0]?.authority) || null,
        };

        loadedSpots.push(spot);
      });

      if (reqId !== activeSpotsRequestIdRef.current) return;

      allSpotsDataRef.current = loadedSpots;

      const isForDest =
        isDestination ||
        Boolean(
          activeDest &&
            Math.abs(lat - activeDest.lat) < 0.02 &&
            Math.abs(lng - activeDest.lng) < 0.02
        );

      if (isForDest) {
        onDestinationSpotsLoadedRef.current?.(loadedSpots);
      }
      onSpotsLoadedRef.current?.(loadedSpots);
      refreshAllMapMarkers();
    } catch (err) {
      console.warn("Error loading spots:", err);
    } finally {
      if (reqId === activeSpotsRequestIdRef.current) {
        setLoading(false);
      }
    }
  }

  return (
    <div role="region" aria-label="Główna mapa kopert parkingowych" className="relative w-full h-full">
      <div
        ref={mapContainerRef}
        className="w-full h-full"
        style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
      />
      
      {loading && (
        <div role="status" aria-live="polite" className="absolute top-24 right-4 z-[400] bg-white/95 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow-md border border-slate-200 flex items-center gap-2">
          <span aria-hidden="true" className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />
          <span>Szukam kopert...</span>
        </div>
      )}
    </div>
  );
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
