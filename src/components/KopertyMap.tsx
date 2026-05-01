"use client";

import { useEffect, useRef, useState } from "react";
import { appConfig } from "@/lib/appConfig";
import {
  escapeHtml,
  formatMeters,
  formatObjectType,
  getOsmTitle,
  type OsmParkingFeature,
  type OsmParkingProperties,
  type OsmParkingResponse
} from "@/lib/osmParking";

type LeafletBase = typeof import("leaflet");

type LeafletModuleWithMaybeDefault = LeafletBase & {
  default?: LeafletBase;
};

type MarkerClusterOptions = {
  showCoverageOnHover?: boolean;
  spiderfyOnMaxZoom?: boolean;
  maxClusterRadius?: number;
  disableClusteringAtZoom?: number;
};

type LeafletWithCluster = LeafletBase & {
  markerClusterGroup?: (
    options?: MarkerClusterOptions
  ) => import("leaflet").LayerGroup;
};

export type UserAddedSpot = {
  id: string;
  lat: number;
  lng: number;
  createdAt: string;
  status: "local_draft";
  confirmations?: number;
};

type KopertyMapProps = {
  full?: boolean;
  onOsmData?: (data: OsmParkingResponse) => void;
  onUserSpotsChange?: (spots: UserAddedSpot[]) => void;
};

const SEARCH_RADIUS_METERS = 5000;
const LOCAL_USER_SPOTS_KEY = "gdzietakoperta.localUserSpots.v1";

function normalizeLeaflet(module: LeafletModuleWithMaybeDefault) {
  return (module.default || module) as LeafletWithCluster;
}

function exposeLeafletGlobally(L: LeafletWithCluster) {
  (globalThis as unknown as { L?: LeafletWithCluster }).L = L;

  if (typeof window !== "undefined") {
    (window as unknown as { L?: LeafletWithCluster }).L = L;
  }
}

function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `local_${Date.now()}_${Math.round(Math.random() * 100000)}`;
}

function readLocalUserSpots() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_USER_SPOTS_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => {
      return (
        typeof item?.id === "string" &&
        typeof item?.lat === "number" &&
        typeof item?.lng === "number"
      );
    }) as UserAddedSpot[];
  } catch {
    return [];
  }
}

function persistLocalUserSpots(spots: UserAddedSpot[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_USER_SPOTS_KEY, JSON.stringify(spots));
}

function formatUserSpotDate(spot: UserAddedSpot) {
  try {
    return new Date(spot.createdAt).toLocaleString("pl-PL");
  } catch {
    return "brak daty";
  }
}

function formatUserSpotGps(spot: UserAddedSpot) {
  return `${spot.lat.toFixed(6)}, ${spot.lng.toFixed(6)}`;
}

function buildPopupHtml(properties: OsmParkingProperties) {
  const title = getOsmTitle(properties);
  const capacityDisabled = properties.capacityDisabled || "brak danych";
  const parkingSpace = properties.parkingSpace || "brak danych";
  const surface = properties.surface || "brak danych";
  const access = properties.access || "brak danych";
  const osmUrl = properties.osmUrl || "https://www.openstreetmap.org";

  return `
    <div class="osm-popup">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(formatObjectType(properties.objectType))}</span>
      <dl>
        <dt>Odległość</dt>
        <dd>${escapeHtml(formatMeters(properties.distanceMeters))}</dd>
        <dt>Miejsca dla OzN</dt>
        <dd>${escapeHtml(capacityDisabled)}</dd>
        <dt>Typ miejsca</dt>
        <dd>${escapeHtml(parkingSpace)}</dd>
        <dt>Nawierzchnia</dt>
        <dd>${escapeHtml(surface)}</dd>
        <dt>Dostęp</dt>
        <dd>${escapeHtml(access)}</dd>
      </dl>
      <a href="${escapeHtml(osmUrl)}" target="_blank" rel="noreferrer">
        Zobacz w OpenStreetMap
      </a>
    </div>
  `;
}

function buildUserSpotPopupHtml(spot: UserAddedSpot) {
  return `
    <div class="osm-popup">
      <strong>Koperta dodana przez użytkownika GTK</strong>
      <span>Punkt lokalny aplikacji GdzieTaKoperta</span>
      <dl>
        <dt>Status</dt>
        <dd>do sprawdzenia</dd>
        <dt>Potwierdzenia</dt>
        <dd>${spot.confirmations || 0} / 5</dd>
        <dt>GPS</dt>
        <dd>${escapeHtml(formatUserSpotGps(spot))}</dd>
        <dt>Dodano</dt>
        <dd>${escapeHtml(formatUserSpotDate(spot))}</dd>
      </dl>
      <span>
        Ten punkt jest obecnie zapisany lokalnie w tej przeglądarce.
        Następny etap: zgłoszenie przez OSM Notes/OAuth.
      </span>
    </div>
  `;
}

export function KopertyMap({
  full = false,
  onOsmData,
  onUserSpotsChange
}: KopertyMapProps) {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const leafletMap = useRef<import("leaflet").Map | null>(null);
  const leafletApi = useRef<LeafletWithCluster | null>(null);
  const userMarker = useRef<import("leaflet").Marker | null>(null);
  const userCircle = useRef<import("leaflet").Circle | null>(null);
  const osmLayer = useRef<import("leaflet").LayerGroup | null>(null);
  const userAddedLayer = useRef<import("leaflet").LayerGroup | null>(null);
  const userSpotsHydrated = useRef(false);
  const pendingUserSpotPopupId = useRef<string | null>(null);

  const [locationMessage, setLocationMessage] = useState(
    "Mapa gotowa. Pobierz lokalizację, aby zobaczyć koperty w promieniu 5 km."
  );
  const [osmCount, setOsmCount] = useState(0);
  const [exactOsmCount, setExactOsmCount] = useState(0);
  const [parkingOsmCount, setParkingOsmCount] = useState(0);
  const [loadingOsm, setLoadingOsm] = useState(false);
  const [addingMode, setAddingMode] = useState(false);
  const [showRemoveChooser, setShowRemoveChooser] = useState(false);
  const [userAddedSpots, setUserAddedSpots] = useState<UserAddedSpot[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadMap() {
      const leafletModule = (await import(
        "leaflet"
      )) as LeafletModuleWithMaybeDefault;

      let L = normalizeLeaflet(leafletModule);

      exposeLeafletGlobally(L);

      try {
        await import("leaflet.markercluster");
        const globalLeaflet = (globalThis as unknown as {
          L?: LeafletWithCluster;
        }).L;

        if (globalLeaflet) {
          L = globalLeaflet;
        }
      } catch {
        // Jeżeli plugin się nie załaduje, mapa nadal działa bez klastrowania.
      }

      leafletApi.current = L;

      if (!mounted || !mapNode.current || leafletMap.current) {
        return;
      }

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

      const localSpots = readLocalUserSpots();
      userSpotsHydrated.current = true;
      setUserAddedSpots(localSpots);
      drawUserAddedSpots(localSpots, L, map);

      window.setTimeout(() => {
        locateUserAndLoadOsm();
      }, 400);
    }

    void loadMap();

    return () => {
      mounted = false;

      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, [full]);

  useEffect(() => {
    if (!addingMode) {
      return;
    }

    const map = leafletMap.current;

    if (!map) {
      return;
    }

    const handleClick = (event: import("leaflet").LeafletMouseEvent) => {
      addUserSpot(event.latlng.lat, event.latlng.lng);
      setAddingMode(false);
    };

    map.on("click", handleClick);

    return () => {
      map.off("click", handleClick);
    };
  }, [addingMode]);

  useEffect(() => {
    if (!userSpotsHydrated.current) {
      return;
    }

    persistLocalUserSpots(userAddedSpots);
    drawUserAddedSpots(userAddedSpots);
    onUserSpotsChange?.(userAddedSpots);
  }, [userAddedSpots, onUserSpotsChange]);

  useEffect(() => {
    if (userAddedSpots.length === 0 && showRemoveChooser) {
      setShowRemoveChooser(false);
    }
  }, [userAddedSpots.length, showRemoveChooser]);

  function clearOsmLayer() {
    const map = leafletMap.current;

    if (map && osmLayer.current) {
      map.removeLayer(osmLayer.current);
      osmLayer.current = null;
    }
  }

  function clearUserAddedLayer(forcedMap?: import("leaflet").Map) {
    const map = forcedMap || leafletMap.current;

    if (map && userAddedLayer.current) {
      map.removeLayer(userAddedLayer.current);
      userAddedLayer.current = null;
    }
  }

  function makeOsmMarker(L: LeafletWithCluster, feature: OsmParkingFeature) {
    const coordinates = feature.geometry.coordinates;
    const lng = coordinates[0];
    const lat = coordinates[1];

    const objectType = feature.properties?.objectType;

    const markerClass =
      objectType === "disabled_parking_space"
        ? "osm-marker osm-marker-space"
        : objectType === "parking_with_disabled_capacity"
          ? "osm-marker osm-marker-parking"
          : "osm-marker osm-marker-default";

    const markerLabel = objectType === "disabled_parking_space" ? "♿" : "P";

    const icon = L.divIcon({
      className: markerClass,
      html: `<span>${markerLabel}</span>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -14]
    });

    return L.marker([lat, lng], { icon }).bindPopup(
      buildPopupHtml(feature.properties || {})
    );
  }

  function makeUserAddedMarker(L: LeafletWithCluster, spot: UserAddedSpot) {
    const icon = L.divIcon({
      className: "user-added-marker",
      html: "<span>＋</span>",
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -16]
    });

    return L.marker([spot.lat, spot.lng], { icon }).bindPopup(
      buildUserSpotPopupHtml(spot)
    );
  }

  function createOsmLayer(L: LeafletWithCluster) {
    if (typeof L.markerClusterGroup === "function") {
      return L.markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        maxClusterRadius: 46,
        disableClusteringAtZoom: 18
      });
    }

    return L.layerGroup();
  }

  function drawUserAddedSpots(
    spots: UserAddedSpot[],
    forcedL?: LeafletWithCluster,
    forcedMap?: import("leaflet").Map
  ) {
    const L = forcedL || leafletApi.current;
    const map = forcedMap || leafletMap.current;

    if (!L || !map) {
      return;
    }

    clearUserAddedLayer(map);

    if (!spots.length) {
      userAddedLayer.current = null;
      return;
    }

    const layer = L.layerGroup();
    let markerToOpen: import("leaflet").Marker | null = null;

    spots.forEach((spot) => {
      const marker = makeUserAddedMarker(L, spot);
      layer.addLayer(marker);

      if (pendingUserSpotPopupId.current === spot.id) {
        markerToOpen = marker;
      }
    });

    layer.addTo(map);
    userAddedLayer.current = layer;

    if (markerToOpen) {
      window.setTimeout(() => {
        markerToOpen?.openPopup();
        pendingUserSpotPopupId.current = null;
      }, 80);
    }
  }

  function drawOsmFeatures(data: OsmParkingResponse) {
    const L = leafletApi.current;
    const map = leafletMap.current;

    if (!L || !map) {
      return;
    }

    clearOsmLayer();

    if (!data.features.length) {
      setOsmCount(0);
      setExactOsmCount(0);
      setParkingOsmCount(0);
      setLocationMessage(
        "Nie znaleziono oznaczonych kopert w OSM w promieniu 5 km. To może oznaczać brak danych, nie brak miejsc."
      );
      return;
    }

    const exactCount = data.features.filter(
      (feature) => feature.properties?.objectType === "disabled_parking_space"
    ).length;

    const parkingCount = data.features.filter(
      (feature) =>
        feature.properties?.objectType === "parking_with_disabled_capacity"
    ).length;

    const layerGroup = createOsmLayer(L);

    data.features.forEach((feature) => {
      layerGroup.addLayer(makeOsmMarker(L, feature));
    });

    layerGroup.addTo(map);
    osmLayer.current = layerGroup;

    const count = data.metadata?.count ?? data.features.length;

    setOsmCount(count);
    setExactOsmCount(exactCount);
    setParkingOsmCount(parkingCount);

    if (exactCount === 0) {
      setLocationMessage(
        `OSM znalazł ${parkingCount} parkingów z miejscami dla OzN, ale brak dokładnie naniesionych kopert. Możesz dodać kopertę na mapie.`
      );
    } else {
      setLocationMessage(
        `Znaleziono ${exactCount} dokładnych kopert i ${parkingCount} parkingów z informacją o miejscach dla OzN.`
      );
    }
  }

  async function fetchOsmParking(lat: number, lng: number) {
    setLoadingOsm(true);
    setLocationMessage("Filtruję snapshot OpenStreetMap dla promienia 5 km…");

    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        radius: String(SEARCH_RADIUS_METERS)
      });

      const response = await fetch(`/api/osm/parking?${params.toString()}`);
      const data = (await response.json()) as Partial<OsmParkingResponse>;

      if (!response.ok || data.error) {
        throw new Error(data.error || "Nie udało się pobrać danych OSM.");
      }

      const osmData = data as OsmParkingResponse;

      drawOsmFeatures(osmData);
      onOsmData?.(osmData);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nieznany błąd pobierania OSM.";

      setLocationMessage(`Błąd OSM: ${message}`);
      setOsmCount(0);
      setExactOsmCount(0);
      setParkingOsmCount(0);

      onOsmData?.({
        type: "FeatureCollection",
        features: [],
        metadata: {
          count: 0,
          radiusMeters: SEARCH_RADIUS_METERS
        }
      });
    } finally {
      setLoadingOsm(false);
    }
  }

  function addUserSpot(lat: number, lng: number) {
    const newSpot: UserAddedSpot = {
      id: createLocalId(),
      lat,
      lng,
      createdAt: new Date().toISOString(),
      status: "local_draft",
      confirmations: 0
    };

    pendingUserSpotPopupId.current = newSpot.id;
    setShowRemoveChooser(false);
    setUserAddedSpots((current) => [newSpot, ...current]);

    setLocationMessage(
      "Dodano lokalną kopertę. Punkt jest zapisany w tej przeglądarce i czeka na zgłoszenie do OSM."
    );
  }

  function removeUserSpotById(spotId: string) {
    const removedSpot = userAddedSpots.find((spot) => spot.id === spotId);
    const next = userAddedSpots.filter((spot) => spot.id !== spotId);

    setUserAddedSpots(next);
    setShowRemoveChooser(next.length > 0);

    if (removedSpot) {
      setLocationMessage(
        `Usunięto kopertę ${removedSpot.lat.toFixed(5)}, ${removedSpot.lng.toFixed(5)}.`
      );
    } else {
      setLocationMessage("Usunięto kopertę.");
    }
  }

  function toggleRemoveChooser() {
    setAddingMode(false);
    setShowRemoveChooser((current) => !current);
  }

  function enableAddingMode() {
    setShowRemoveChooser(false);
    setAddingMode(true);
    setLocationMessage(
      "Tryb dodawania aktywny: kliknij dokładne miejsce koperty na mapie."
    );
  }

  function locateUserAndLoadOsm() {
    const L = leafletApi.current;
    const map = leafletMap.current;

    if (!L || !map) {
      return;
    }

    if (!navigator.geolocation) {
      setLocationMessage(
        "Ta przeglądarka nie obsługuje geolokalizacji. Później dodamy wybór miasta/adresu."
      );
      return;
    }

    setLocationMessage("Czekam na zgodę na lokalizację urządzenia…");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        if (userMarker.current) {
          userMarker.current.setLatLng([lat, lng]);
        } else {
          const userIcon = L.divIcon({
            className: "user-marker live-user-marker",
            html: "<span>●</span>",
            iconSize: [26, 26],
            iconAnchor: [13, 13]
          });

          userMarker.current = L.marker([lat, lng], { icon: userIcon })
            .addTo(map)
            .bindPopup("Twoja lokalizacja");
        }

        if (userCircle.current) {
          userCircle.current.setLatLng([lat, lng]);
          userCircle.current.setRadius(SEARCH_RADIUS_METERS);
        } else {
          userCircle.current = L.circle([lat, lng], {
            radius: SEARCH_RADIUS_METERS,
            color: "#1477d4",
            weight: 2,
            opacity: 0.75,
            fillColor: "#1477d4",
            fillOpacity: 0.06,
            dashArray: "8 8"
          }).addTo(map);
        }

        map.fitBounds(userCircle.current.getBounds(), {
          padding: [24, 24]
        });

        void fetchOsmParking(lat, lng);
      },
      () => {
        setLocationMessage(
          "Nie uzyskano lokalizacji. Kliknij ponownie albo sprawdź zgodę w przeglądarce."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000
      }
    );
  }

  return (
    <div className={`map-shell ${full ? "map-shell-full" : ""}`}>
      <div
        ref={mapNode}
        className={`map-node ${addingMode ? "map-node-adding" : ""}`}
        aria-label="Mapa kopert"
      />

      <div className="map-toolbar map-toolbar-expanded" aria-live="polite">
        <button
          className="secondary-button"
          onClick={locateUserAndLoadOsm}
          type="button"
          disabled={loadingOsm}
        >
          {loadingOsm ? "Szukam…" : "Pokaż obszar 5 km"}
        </button>

        <button
          className={`secondary-button add-koperta-button ${
            userAddedSpots.length > 0 ? "add-koperta-button-ready" : ""
          } ${addingMode ? "add-koperta-button-active" : ""}`}
          onClick={enableAddingMode}
          type="button"
        >
          {addingMode
            ? "Kliknij miejsce na mapie"
            : userAddedSpots.length > 0
              ? "Dodaj kolejną kopertę na mapie"
              : "Dodaj kopertę na mapie"}
        </button>

        {userAddedSpots.length > 0 ? (
          <button
            className="secondary-button remove-koperta-button"
            onClick={toggleRemoveChooser}
            type="button"
          >
            {showRemoveChooser ? "Zamknij wybór" : "Usuń moją kopertę"}
          </button>
        ) : null}

        <span>{locationMessage}</span>

        <span className="map-status-pill">♿ OSM: {exactOsmCount}</span>
        <span className="map-status-pill">P: {parkingOsmCount}</span>
        <span className="map-status-pill">Moje: {userAddedSpots.length}</span>
        <span className="map-status-pill">Razem OSM: {osmCount}</span>

        {showRemoveChooser && userAddedSpots.length > 0 ? (
          <div className="remove-chooser-card">
            <div className="remove-chooser-header">
              <div>
                <strong>Którą kopertę usunąć?</strong>
                <span>
                  Wybierz punkt dodany lokalnie w tej przeglądarce.
                </span>
              </div>
              <span className="remove-chooser-count">
                {userAddedSpots.length}
              </span>
            </div>

            <div className="remove-chooser-list">
              {userAddedSpots.map((spot, index) => (
                <article className="remove-chooser-item" key={spot.id}>
                  <div className="remove-chooser-main">
                    <span className="remove-chooser-index">
                      {index + 1}
                    </span>

                    <div>
                      <h3>Koperta {index + 1}</h3>
                      <p>{formatUserSpotGps(spot)}</p>
                      <small>Dodano: {formatUserSpotDate(spot)}</small>
                    </div>
                  </div>

                  <div className="remove-chooser-status">
                    <span>do sprawdzenia</span>
                    <span>{spot.confirmations || 0} / 5 potwierdzeń</span>
                  </div>

                  <button
                    type="button"
                    className="remove-single-button"
                    onClick={() => removeUserSpotById(spot.id)}
                  >
                    Usuń tę kopertę
                  </button>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
