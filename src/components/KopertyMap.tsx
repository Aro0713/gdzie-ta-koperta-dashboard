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

type OsmMeResponse = {
  authenticated: boolean;
  user?: {
    id?: number;
    displayName?: string;
    accountCreated?: string;
  };
  scope?: string;
};

export type UserAddedSpot = {
  id: string;
  lat: number;
  lng: number;
  createdAt: string;
  editedAt?: string;
  status: "local_draft";
  confirmations?: number;
  addedByName?: string;
  addedByOsmId?: number;
  lastConfirmedByName?: string;
  lastConfirmedAt?: string;
};

type KopertyMapProps = {
  full?: boolean;
  onOsmData?: (data: OsmParkingResponse) => void;
  onUserSpotsChange?: (spots: UserAddedSpot[]) => void;
};

const MIN_SEARCH_RADIUS_METERS = 100;
const MAX_SEARCH_RADIUS_METERS = 5000;
const DEFAULT_SEARCH_RADIUS_METERS = 5000;
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

function formatUserSpotEditedDate(spot: UserAddedSpot) {
  if (!spot.editedAt) {
    return null;
  }

  try {
    return new Date(spot.editedAt).toLocaleString("pl-PL");
  } catch {
    return null;
  }
}

function formatUserSpotGps(spot: UserAddedSpot) {
  return `${spot.lat.toFixed(6)}, ${spot.lng.toFixed(6)}`;
}

function clampRadius(value: number) {
  return Math.max(
    MIN_SEARCH_RADIUS_METERS,
    Math.min(MAX_SEARCH_RADIUS_METERS, value)
  );
}

function formatRadiusLabel(value: number) {
  if (value >= 1000) {
    const km = value / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
  }

  return `${value} m`;
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
  const addedBy = spot.addedByName || "użytkownik lokalny";
  const editedDate = formatUserSpotEditedDate(spot);
  const confirmations = spot.confirmations || 0;

  return `
    <div class="osm-popup gtk-popup">
      <strong>Szkic koperty GTK</strong>
      <span>Lokalny szkic – jeszcze nie zapisano w OSM</span>
      <dl>
        <dt>Status</dt>
        <dd>do wysłania do OSM</dd>
        <dt>Dodane przez</dt>
        <dd>${escapeHtml(addedBy)}</dd>
        <dt>Dodano</dt>
        <dd>${escapeHtml(formatUserSpotDate(spot))}</dd>
        ${
          editedDate
            ? `<dt>Edytowano</dt><dd>${escapeHtml(editedDate)}</dd>`
            : ""
        }
        <dt>Potwierdzenia</dt>
        <dd>${confirmations} / 5</dd>
        ${
          spot.lastConfirmedByName
            ? `<dt>Ostatnio potwierdził</dt><dd>${escapeHtml(
                spot.lastConfirmedByName
              )}</dd>`
            : ""
        }
        <dt>GPS</dt>
        <dd>${escapeHtml(formatUserSpotGps(spot))}</dd>
      </dl>

      <div class="gtk-popup-actions">
        <button
          type="button"
          class="gtk-popup-button gtk-popup-button-confirm"
          data-gtk-spot-action="confirm"
          data-gtk-spot-id="${escapeHtml(spot.id)}"
        >
          Potwierdź
        </button>

        <button
          type="button"
          class="gtk-popup-button gtk-popup-button-edit"
          data-gtk-spot-action="edit"
          data-gtk-spot-id="${escapeHtml(spot.id)}"
        >
          Edytuj położenie
        </button>

        <button
          type="button"
          class="gtk-popup-button gtk-popup-button-delete"
          data-gtk-spot-action="delete"
          data-gtk-spot-id="${escapeHtml(spot.id)}"
        >
          Usuń
        </button>
      </div>

      <span>
        Ten punkt jest zapisany tylko lokalnie w tej przeglądarce.
        Następny etap: wysłanie do OSM z konta użytkownika.
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
  const userPosition = useRef<{ lat: number; lng: number } | null>(null);

  const [locationMessage, setLocationMessage] = useState(
    "Mapa gotowa. Pobierz lokalizację, aby zobaczyć koperty w wybranym promieniu."
  );
  const [osmCount, setOsmCount] = useState(0);
  const [exactOsmCount, setExactOsmCount] = useState(0);
  const [parkingOsmCount, setParkingOsmCount] = useState(0);
  const [loadingOsm, setLoadingOsm] = useState(false);
  const [addingMode, setAddingMode] = useState(false);
  const [editingSpotId, setEditingSpotId] = useState<string | null>(null);
  const [radiusMeters, setRadiusMeters] = useState(DEFAULT_SEARCH_RADIUS_METERS);
  const [userAddedSpots, setUserAddedSpots] = useState<UserAddedSpot[]>([]);
  const [showRemoveChooser, setShowRemoveChooser] = useState(false);
  const [osmUser, setOsmUser] = useState<NonNullable<OsmMeResponse["user"]> | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadOsmUser() {
      try {
        const response = await fetch("/api/osm/auth/me");
        const data = (await response.json()) as OsmMeResponse;

        if (mounted && data.authenticated && data.user) {
          setOsmUser(data.user);
        }
      } catch {
        if (mounted) {
          setOsmUser(null);
        }
      }
    }

    void loadOsmUser();

    return () => {
      mounted = false;
    };
  }, []);

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
    if (!editingSpotId) {
      return;
    }

    const map = leafletMap.current;

    if (!map) {
      return;
    }

    const handleClick = (event: import("leaflet").LeafletMouseEvent) => {
      moveUserSpot(editingSpotId, event.latlng.lat, event.latlng.lng);
      setEditingSpotId(null);
    };

    map.on("click", handleClick);

    return () => {
      map.off("click", handleClick);
    };
  }, [editingSpotId]);

  useEffect(() => {
    const handlePopupAction = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>(
        "[data-gtk-spot-action]"
      );

      if (!button) {
        return;
      }

      event.preventDefault();

      const action = button.dataset.gtkSpotAction;
      const spotId = button.dataset.gtkSpotId;

      if (!spotId) {
        return;
      }

      if (action === "confirm") {
        confirmUserSpotById(spotId);
      }

      if (action === "edit") {
        startEditingUserSpot(spotId);
      }

      if (action === "delete") {
        removeUserSpotById(spotId);
      }
    };

    document.addEventListener("click", handlePopupAction);

    return () => {
      document.removeEventListener("click", handlePopupAction);
    };
  });

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
      className: "user-added-marker gtk-local-marker",
      html: `
        <span class="gtk-marker-icon">♿</span>
        <small class="gtk-marker-label">GTK</small>
      `,
      iconSize: [46, 46],
      iconAnchor: [23, 23],
      popupAnchor: [0, -18]
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
        `Nie znaleziono oznaczonych kopert w OSM w promieniu ${formatRadiusLabel(
          radiusMeters
        )}. To może oznaczać brak danych, nie brak miejsc.`
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
        `OSM znalazł ${parkingCount} parkingów z miejscami dla OzN w promieniu ${formatRadiusLabel(
          radiusMeters
        )}, ale brak dokładnie naniesionych kopert. Możesz dodać szkic koperty na mapie.`
      );
    } else {
      setLocationMessage(
        `Znaleziono ${exactCount} dokładnych kopert i ${parkingCount} parkingów z informacją o miejscach dla OzN w promieniu ${formatRadiusLabel(
          radiusMeters
        )}.`
      );
    }
  }

  async function fetchOsmParking(
    lat: number,
    lng: number,
    radius = radiusMeters
  ) {
    const safeRadius = clampRadius(radius);

    setLoadingOsm(true);
    setLocationMessage(
      `Filtruję snapshot OpenStreetMap dla promienia ${formatRadiusLabel(
        safeRadius
      )}…`
    );

    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        radius: String(safeRadius)
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
          radiusMeters: safeRadius
        }
      });
    } finally {
      setLoadingOsm(false);
    }
  }

  function updateVisibleRadius(radius: number) {
    const safeRadius = clampRadius(radius);
    const map = leafletMap.current;

    if (!map || !userCircle.current) {
      return;
    }

    userCircle.current.setRadius(safeRadius);

    map.fitBounds(userCircle.current.getBounds(), {
      padding: [24, 24]
    });
  }

  function refreshForRadius(radius: number) {
    const safeRadius = clampRadius(radius);
    const position = userPosition.current;

    if (!position) {
      locateUserAndLoadOsm(safeRadius);
      return;
    }

    updateVisibleRadius(safeRadius);
    void fetchOsmParking(position.lat, position.lng, safeRadius);
  }

  function addUserSpot(lat: number, lng: number) {
    const newSpot: UserAddedSpot = {
      id: createLocalId(),
      lat,
      lng,
      createdAt: new Date().toISOString(),
      status: "local_draft",
      confirmations: 0,
      addedByName: osmUser?.displayName || "użytkownik lokalny",
      addedByOsmId: osmUser?.id
    };

    pendingUserSpotPopupId.current = newSpot.id;
    setShowRemoveChooser(false);
    setEditingSpotId(null);
    setUserAddedSpots((current) => [newSpot, ...current]);

    setLocationMessage(
      "Dodano szkic koperty lokalnie. Punkt jest zapisany tylko w tej przeglądarce i czeka na wysłanie do OSM."
    );
  }

  function confirmUserSpotById(spotId: string) {
    pendingUserSpotPopupId.current = spotId;

    setUserAddedSpots((current) =>
      current.map((spot) => {
        if (spot.id !== spotId) {
          return spot;
        }

        const nextConfirmations = Math.min((spot.confirmations || 0) + 1, 5);

        return {
          ...spot,
          confirmations: nextConfirmations,
          lastConfirmedByName: osmUser?.displayName || "użytkownik lokalny",
          lastConfirmedAt: new Date().toISOString()
        };
      })
    );

    setLocationMessage(
      "Potwierdzono lokalny szkic koperty. To nadal nie jest wpis w OSM."
    );
  }

  function startEditingUserSpot(spotId: string) {
    setAddingMode(false);
    setShowRemoveChooser(false);
    setEditingSpotId(spotId);
    setLocationMessage(
      "Tryb edycji aktywny: kliknij nowe, dokładne położenie tej koperty na mapie."
    );
  }

  function moveUserSpot(spotId: string, lat: number, lng: number) {
    pendingUserSpotPopupId.current = spotId;

    setUserAddedSpots((current) =>
      current.map((spot) => {
        if (spot.id !== spotId) {
          return spot;
        }

        return {
          ...spot,
          lat,
          lng,
          editedAt: new Date().toISOString()
        };
      })
    );

    setLocationMessage(
      "Zmieniono położenie lokalnego szkicu koperty. Zmiana nadal nie jest zapisana w OSM."
    );
  }

  function removeUserSpotById(spotId: string) {
    const removedSpot = userAddedSpots.find((spot) => spot.id === spotId);
    const next = userAddedSpots.filter((spot) => spot.id !== spotId);

    setUserAddedSpots(next);
    setShowRemoveChooser(next.length > 0);
    setEditingSpotId(null);

    if (removedSpot) {
      setLocationMessage(
        `Usunięto szkic koperty ${removedSpot.lat.toFixed(
          5
        )}, ${removedSpot.lng.toFixed(5)}.`
      );
    } else {
      setLocationMessage("Usunięto szkic koperty.");
    }
  }

  function toggleRemoveChooser() {
    setAddingMode(false);
    setEditingSpotId(null);
    setShowRemoveChooser((current) => !current);
  }

  function enableAddingMode() {
    setShowRemoveChooser(false);
    setEditingSpotId(null);
    setAddingMode(true);
    setLocationMessage(
      "Tryb dodawania aktywny: kliknij dokładne miejsce koperty na mapie. To utworzy lokalny szkic, nie wpis w OSM."
    );
  }

  function locateUserAndLoadOsm(radiusOverride?: number) {
    const L = leafletApi.current;
    const map = leafletMap.current;
    const safeRadius = clampRadius(radiusOverride ?? radiusMeters);

    if (!L || !map) {
      return;
    }

    if (!navigator.geolocation) {
      setLocationMessage(
        "Ta przeglądarka nie obsługuje geolokalizacji. Później dodamy wybór miasta/adresu."
      );
      return;
    }

    setRadiusMeters(safeRadius);
    setLocationMessage("Czekam na zgodę na lokalizację urządzenia…");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        userPosition.current = {
          lat,
          lng
        };

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
          userCircle.current.setRadius(safeRadius);
        } else {
          userCircle.current = L.circle([lat, lng], {
            radius: safeRadius,
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

        void fetchOsmParking(lat, lng, safeRadius);
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
        className={`map-node ${
          addingMode || editingSpotId ? "map-node-adding" : ""
        }`}
        aria-label="Mapa kopert"
      />

      <div className="map-toolbar map-toolbar-modern" aria-live="polite">
        <div className="map-toolbar-top">
          <div className="map-toolbar-actions">
            <button
              className="map-btn map-btn-neutral"
              onClick={() => locateUserAndLoadOsm(radiusMeters)}
              type="button"
              disabled={loadingOsm}
            >
              {loadingOsm ? "Szukam…" : "Pobierz lokalizację"}
            </button>

            <button
              className={`map-btn map-btn-add ${
                addingMode ? "map-btn-add-active" : ""
              } ${userAddedSpots.length > 0 ? "map-btn-add-ready" : ""}`}
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
                className="map-btn map-btn-danger"
                onClick={toggleRemoveChooser}
                type="button"
              >
                {showRemoveChooser ? "Zamknij wybór" : "Usuń moją kopertę"}
              </button>
            ) : null}
          </div>

          <div className="map-toolbar-chips">
            <span className="map-status-pill">♿ OSM: {exactOsmCount}</span>
            <span className="map-status-pill">P: {parkingOsmCount}</span>
            <span className="map-status-pill">Moje: {userAddedSpots.length}</span>
            <span className="map-status-pill">Razem OSM: {osmCount}</span>
          </div>
        </div>

        <div className="map-toolbar-bottom">
          <div className="map-radius-card">
            <div className="map-radius-header">
              <span className="map-radius-title">Obszar wyszukiwania</span>
              <strong className="map-radius-value">
                {formatRadiusLabel(radiusMeters)}
              </strong>
            </div>

            <input
              type="range"
              min={MIN_SEARCH_RADIUS_METERS}
              max={MAX_SEARCH_RADIUS_METERS}
              step={100}
              value={radiusMeters}
              className="map-radius-slider"
              onChange={(event) => {
                const next = clampRadius(Number(event.target.value));
                setRadiusMeters(next);
                updateVisibleRadius(next);
              }}
              onMouseUp={(event) => {
                const next = clampRadius(Number(event.currentTarget.value));
                refreshForRadius(next);
              }}
              onTouchEnd={(event) => {
                const next = clampRadius(Number(event.currentTarget.value));
                refreshForRadius(next);
              }}
            />

            <div className="map-radius-scale">
              <span>100 m</span>
              <span>1 km</span>
              <span>2,5 km</span>
              <span>5 km</span>
            </div>
          </div>

          <div className="map-toolbar-message">
            {editingSpotId
              ? "Tryb edycji aktywny. Kliknij nowe położenie koperty na mapie."
              : addingMode
                ? "Tryb dodawania aktywny. Kliknij dokładne miejsce koperty na mapie."
                : locationMessage}
          </div>
        </div>

        {showRemoveChooser && userAddedSpots.length > 0 ? (
          <div className="remove-chooser-card">
            <div className="remove-chooser-header">
              <div>
                <strong>Którą kopertę usunąć?</strong>
                <span>
                  Wybierz lokalny szkic zapisany w tej przeglądarce.
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
                      <h3>Szkic koperty {index + 1}</h3>
                      <p>{formatUserSpotGps(spot)}</p>
                      <small>Dodano: {formatUserSpotDate(spot)}</small>
                      <small>Autor: {spot.addedByName || "użytkownik lokalny"}</small>
                    </div>
                  </div>

                  <div className="remove-chooser-status">
                    <span>lokalny szkic</span>
                    <span>{spot.confirmations || 0} / 5 potwierdzeń</span>
                  </div>

                  <div className="remove-chooser-actions">
                    <button
                      type="button"
                      className="confirm-single-button"
                      onClick={() => confirmUserSpotById(spot.id)}
                    >
                      Potwierdź
                    </button>

                    <button
                      type="button"
                      className="edit-single-button"
                      onClick={() => startEditingUserSpot(spot.id)}
                    >
                      Edytuj
                    </button>

                    <button
                      type="button"
                      className="remove-single-button"
                      onClick={() => removeUserSpotById(spot.id)}
                    >
                      Usuń
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
