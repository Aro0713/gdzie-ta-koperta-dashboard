import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  UserLocation,
  type CameraRef,
  type LngLat
} from "@maplibre/maplibre-react-native";

import {
  fetchNearbyParking,
  type ParkingFeature
} from "@/lib/parkingApi";
import {
  fetchRouteAssistant,
  type RouteAssistantResponse
} from "@/lib/routeAssistantApi";
import {
  clearStoredOsmSession,
  getOsmMe,
  loginWithOsm,
  submitDisabledParkingSpace,
  type OsmMobileUser
} from "@/lib/osmMobileAuth";
import { useNavigationVoice } from "@/lib/useNavigationVoice";

type Position = {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
};

type DraftSpot = {
  id: string;
  lat: number;
  lng: number;
  status: "draft" | "submitted_to_osm";
  osmUrl?: string;
  osmNodeId?: string;
  osmChangesetId?: string;
};

type NavigationCameraMode = "heading" | "north";

const DEFAULT_CENTER: LngLat = [21.017532, 52.237049];
const REROUTE_DISTANCE_METERS = 75;
const REROUTE_MIN_INTERVAL_MS = 6000;

const OSM_RASTER_STYLE = {
  version: 8 as 8,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors"
    }
  },
  layers: [
    {
      id: "osm",
      type: "raster" as const,
      source: "osm"
    }
  ]
};

function positionToLngLat(position: Position): LngLat {
  return [position.lng, position.lat];
}

function featureToLngLat(feature?: ParkingFeature | null): LngLat | null {
  const coordinates = feature?.geometry?.coordinates;

  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return [lng, lat];
}

function unknownRouteCoordinateToLngLat(value: unknown): LngLat | null {
  if (Array.isArray(value)) {
    const lng = Number(value[0]);
    const lat = Number(value[1]);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lng, lat];
    }

    return null;
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const lat = Number(record.lat ?? record.latitude);
    const lng = Number(record.lng ?? record.longitude);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return [lng, lat];
    }
  }

  return null;
}

function routeCoordinatesToLngLat(values?: unknown[]) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map(unknownRouteCoordinateToLngLat)
    .filter((coordinate): coordinate is LngLat => Boolean(coordinate));
}

function getPreferredRoute(response: RouteAssistantResponse | null) {
  if (!response) {
    return [];
  }

  const toSpot = routeCoordinatesToLngLat(response.routeToSpotCoordinates);

  if (toSpot.length > 1) {
    return toSpot;
  }

  const primary = routeCoordinatesToLngLat(response.routeCoordinates);

  if (primary.length > 1) {
    return primary;
  }

  return routeCoordinatesToLngLat(response.routeToDestinationCoordinates);
}

function getFeatureKey(feature: ParkingFeature, index: number) {
  const properties = feature.properties || {};
  const osmType = properties.osmType || "node";
  const osmId = properties.osmId;

  if (osmId !== undefined && osmId !== null) {
    return `${osmType}:${osmId}`;
  }

  return `feature:${index}`;
}

function getLngLatBounds(points: LngLat[]) {
  if (points.length === 0) {
    return null;
  }

  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);

  return [
    Math.min(...lngs),
    Math.min(...lats),
    Math.max(...lngs),
    Math.max(...lats)
  ] as [number, number, number, number];
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineMeters(first: LngLat, second: LngLat) {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(second[1] - first[1]);
  const dLng = toRadians(second[0] - first[0]);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(first[1])) *
      Math.cos(toRadians(second[1])) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function projectMeters(point: LngLat, origin: LngLat) {
  const earthRadiusMeters = 6371000;
  const x =
    toRadians(point[0] - origin[0]) *
    Math.cos(toRadians(origin[1])) *
    earthRadiusMeters;
  const y = toRadians(point[1] - origin[1]) * earthRadiusMeters;

  return { x, y };
}

function distancePointToSegmentMeters(point: LngLat, start: LngLat, end: LngLat) {
  const p = projectMeters(point, point);
  const a = projectMeters(start, point);
  const b = projectMeters(end, point);

  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const apX = p.x - a.x;
  const apY = p.y - a.y;
  const abLengthSquared = abX * abX + abY * abY;

  if (abLengthSquared === 0) {
    return haversineMeters(point, start);
  }

  const t = Math.max(0, Math.min(1, (apX * abX + apY * abY) / abLengthSquared));
  const closestX = a.x + abX * t;
  const closestY = a.y + abY * t;

  return Math.sqrt((p.x - closestX) ** 2 + (p.y - closestY) ** 2);
}

function distanceToRouteMeters(point: LngLat, route: LngLat[]) {
  if (route.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  let minDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < route.length; index += 1) {
    const distance = distancePointToSegmentMeters(
      point,
      route[index - 1],
      route[index]
    );

    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

export default function HomeScreen() {
  const cameraRef = useRef<CameraRef | null>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);

  const routeLineRef = useRef<LngLat[]>([]);
  const rerouteInProgressRef = useRef(false);
  const lastRerouteAtRef = useRef(0);
  const navigationActiveRef = useRef(false);
  const destinationQueryRef = useRef("");
  const draftSpotRef = useRef<DraftSpot | null>(null);
  const osmUserRef = useRef<OsmMobileUser | null>(null);
  const cameraModeRef = useRef<NavigationCameraMode>("heading");

  const [destinationQuery, setDestinationQuery] = useState("");
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [nearbyParking, setNearbyParking] = useState<ParkingFeature[]>([]);
  const [routeResult, setRouteResult] = useState<RouteAssistantResponse | null>(null);
  const [draftSpot, setDraftSpot] = useState<DraftSpot | null>(null);

  const [osmUser, setOsmUser] = useState<OsmMobileUser | null>(null);
  const [message, setMessage] = useState("Wyszukaj cel podróży.");
  const [loading, setLoading] = useState(false);
  const [navigationActive, setNavigationActive] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [cameraMode, setCameraMode] = useState<NavigationCameraMode>("heading");

  const { playVoiceCommand, voiceError } = useNavigationVoice();

  const routeLine = useMemo(() => getPreferredRoute(routeResult), [routeResult]);

  const routeGeoJson = useMemo(() => {
    if (routeLine.length <= 1) {
      return {
        type: "FeatureCollection" as const,
        features: []
      };
    }

    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: routeLine
          }
        }
      ]
    };
  }, [routeLine]);

  useEffect(() => {
    routeLineRef.current = routeLine;
  }, [routeLine]);

  useEffect(() => {
    navigationActiveRef.current = navigationActive;
  }, [navigationActive]);

  useEffect(() => {
    destinationQueryRef.current = destinationQuery;
  }, [destinationQuery]);

  useEffect(() => {
    draftSpotRef.current = draftSpot;
  }, [draftSpot]);

  useEffect(() => {
    osmUserRef.current = osmUser;
  }, [osmUser]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  useEffect(() => {
    let mounted = true;

    async function loadOsmUser() {
      try {
        const me = await getOsmMe();

        if (!mounted) {
          return;
        }

        setOsmUser(me.authenticated && me.user ? me.user : null);
      } catch {
        if (mounted) {
          setOsmUser(null);
        }
      }
    }

    void loadOsmUser();

    return () => {
      mounted = false;

      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
    };
  }, []);

  function setCamera(params: {
    center: LngLat;
    zoom?: number;
    heading?: number | null;
    duration?: number;
  }) {
    const mode = cameraModeRef.current;
    const rawHeading = Number(params.heading);
    const heading =
      mode === "heading" && Number.isFinite(rawHeading) ? rawHeading : 0;
    const duration = params.duration ?? 350;
    const zoom = params.zoom ?? 16;

    const camera = cameraRef.current as unknown as {
      setCamera?: (next: Record<string, unknown>) => void;
      easeTo?: (next: { center: LngLat; duration?: number }) => void;
      zoomTo?: (zoom: number, options?: { duration?: number }) => void;
    } | null;

    if (camera?.setCamera) {
      camera.setCamera({
        centerCoordinate: params.center,
        zoomLevel: zoom,
        heading,
        bearing: heading,
        animationDuration: duration,
        animationMode: "easeTo"
      });
      return;
    }

    cameraRef.current?.easeTo({
      center: params.center,
      duration
    });
    cameraRef.current?.zoomTo(zoom, { duration });
  }

  function focusPoint(point: LngLat, zoom = 16, duration = 450) {
    setCamera({
      center: point,
      zoom,
      heading: 0,
      duration
    });
  }

  function focusNavigation(position: Position, duration = 260) {
    setCamera({
      center: positionToLngLat(position),
      zoom: 17,
      heading: position.heading,
      duration
    });
  }

  function fitRoute(points: LngLat[]) {
    const bounds = getLngLatBounds(points);

    if (!bounds) {
      return;
    }

    cameraRef.current?.fitBounds(bounds, {
      padding: {
        top: 120,
        right: 40,
        bottom: 220,
        left: 40
      },
      duration: 650
    });
  }

  async function requestPosition() {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== "granted") {
      throw new Error("Brak zgody na lokalizację.");
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High
    });

    const nextPosition: Position = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      heading: position.coords.heading
    };

    setCurrentPosition(nextPosition);
    focusPoint(positionToLngLat(nextPosition), 16);

    return nextPosition;
  }

  async function loadNearbyParking(position: Position) {
    const response = await fetchNearbyParking({
      lat: position.lat,
      lng: position.lng,
      radius: 5000
    });

    setNearbyParking(response.features.slice(0, 30));

    return response;
  }

  async function calculateRouteFromPosition(params: {
    query: string;
    position: Position;
    isReroute?: boolean;
  }) {
    const draft = draftSpotRef.current;
    const user = osmUserRef.current;

    const response = await fetchRouteAssistant({
      query: params.query,
      userLat: params.position.lat,
      userLng: params.position.lng,
      localSpots: draft
        ? [
            {
              id: draft.id,
              lat: draft.lat,
              lng: draft.lng,
              status: draft.status,
              osmUrl: draft.osmUrl || null,
              osmNodeId: draft.osmNodeId || null,
              addedByName: user?.displayName || null
            }
          ]
        : []
    });

    setRouteResult(response);

    const nextRouteLine = getPreferredRoute(response);

    if (params.isReroute) {
      setMessage("Trasa została przeliczona.");
      playVoiceCommand("route_recalculated");
      focusNavigation(params.position, 250);
      return response;
    }

    if (response.recommendedSpot) {
      setMessage(
        `Prowadzę do koperty. ${response.spotDistanceToDestinationLabel || ""} od celu.`
      );
      playVoiceCommand("gtk_found_parking");
    } else {
      setMessage("Nie znaleziono koperty przy celu. Prowadzę do wskazanego adresu.");
      playVoiceCommand("nav_route_ready");
    }

    if (nextRouteLine.length > 1) {
      fitRoute(nextRouteLine);
    }

    return response;
  }

  async function maybeRerouteFromPosition(position: Position) {
    if (!navigationActiveRef.current || rerouteInProgressRef.current) {
      return;
    }

    const query = destinationQueryRef.current.trim();

    if (!query) {
      return;
    }

    const route = routeLineRef.current;

    if (route.length < 2) {
      return;
    }

    const distanceFromRoute = distanceToRouteMeters(positionToLngLat(position), route);

    if (distanceFromRoute < REROUTE_DISTANCE_METERS) {
      return;
    }

    const now = Date.now();

    if (now - lastRerouteAtRef.current < REROUTE_MIN_INTERVAL_MS) {
      return;
    }

    lastRerouteAtRef.current = now;
    rerouteInProgressRef.current = true;

    try {
      setMessage("Przeliczam trasę...");
      playVoiceCommand("route_recalculating");

      await calculateRouteFromPosition({
        query,
        position,
        isReroute: true
      });
    } catch {
      setMessage("Nie udało się przeliczyć trasy.");
      playVoiceCommand("route_no_route_found");
    } finally {
      rerouteInProgressRef.current = false;
    }
  }

  async function handleUseLocation() {
    try {
      setLoading(true);
      setMessage("Pobieram lokalizację...");

      const position = await requestPosition();
      const response = await loadNearbyParking(position);

      setMessage(`Znaleziono ${response.features.length} kopert w promieniu 5 km.`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Nie udało się pobrać lokalizacji.";

      setMessage(errorMessage);
      playVoiceCommand("route_network_error");
    } finally {
      setLoading(false);
    }
  }

  async function handleFindRoute() {
    const query = destinationQuery.trim();

    if (!query) {
      setMessage("Wpisz cel podróży.");
      playVoiceCommand("nav_destination_needed");
      return;
    }

    Keyboard.dismiss();
    setSearchFocused(false);

    try {
      setLoading(true);
      setMessage("Szukam celu, koperty i trasy...");
      playVoiceCommand("nav_route_calculating");

      const position = currentPosition || (await requestPosition());

      await calculateRouteFromPosition({
        query,
        position
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Nie udało się wyznaczyć trasy.";

      setMessage(errorMessage);
      playVoiceCommand("route_no_route_found");
    } finally {
      setLoading(false);
    }
  }

  async function handleStartNavigation() {
    if (!routeResult) {
      setMessage("Najpierw wyznacz trasę.");
      return;
    }

    try {
      setLoading(true);
      Keyboard.dismiss();
      setSearchFocused(false);

      const position = currentPosition || (await requestPosition());

      setNavigationActive(true);
      setMessage("Nawigacja uruchomiona.");
      playVoiceCommand("nav_navigation_start");

      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }

      locationWatchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1200,
          distanceInterval: 4
        },
        (nextPosition) => {
          const updated: Position = {
            lat: nextPosition.coords.latitude,
            lng: nextPosition.coords.longitude,
            accuracy: nextPosition.coords.accuracy,
            heading: nextPosition.coords.heading
          };

          setCurrentPosition(updated);
          focusNavigation(updated);
          void maybeRerouteFromPosition(updated);
        }
      );

      focusNavigation(position);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Nie udało się uruchomić nawigacji.";

      setMessage(errorMessage);
      playVoiceCommand("route_network_error");
    } finally {
      setLoading(false);
    }
  }

  function handleStopNavigation() {
    if (locationWatchRef.current) {
      locationWatchRef.current.remove();
      locationWatchRef.current = null;
    }

    setNavigationActive(false);
    setMessage("Nawigacja zatrzymana.");
    playVoiceCommand("nav_navigation_stop");
  }

  function toggleCameraMode() {
    setCameraMode((current) => {
      const next = current === "heading" ? "north" : "heading";
      cameraModeRef.current = next;

      if (currentPosition) {
        focusNavigation(currentPosition, 250);
      }

      return next;
    });
  }

  async function handleAddDraftEnvelope() {
    try {
      setLoading(true);
      Keyboard.dismiss();
      setSearchFocused(false);

      const position = currentPosition || (await requestPosition());

      const draft: DraftSpot = {
        id: `mobile-${Date.now()}`,
        lat: position.lat,
        lng: position.lng,
        status: "draft"
      };

      setDraftSpot(draft);
      setMessage("Dodano szkic koperty z aktualnej pozycji.");
      focusPoint(positionToLngLat(position), 17);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Nie udało się dodać szkicu koperty.";

      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function handleOsmLoginOrLogout() {
    try {
      setLoading(true);

      if (osmUser) {
        await clearStoredOsmSession();
        setOsmUser(null);
        setMessage("Wylogowano z OpenStreetMap.");
        return;
      }

      const me = await loginWithOsm();

      if (me.authenticated && me.user) {
        setOsmUser(me.user);
        setMessage(`Zalogowano OSM: ${me.user.displayName || me.user.id}`);
      } else {
        setMessage("Nie udało się potwierdzić logowania OSM.");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Nie udało się zalogować OSM.";

      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitDraftEnvelope() {
    if (!draftSpot) {
      setMessage("Najpierw dodaj szkic koperty.");
      return;
    }

    try {
      setSubmitLoading(true);

      if (!osmUser) {
        setMessage("Zaloguj się do OpenStreetMap przed wysłaniem koperty.");
        const me = await loginWithOsm();

        if (me.authenticated && me.user) {
          setOsmUser(me.user);
        } else {
          throw new Error("Brak aktywnej sesji OSM.");
        }
      }

      const result = await submitDisabledParkingSpace({
        lat: draftSpot.lat,
        lng: draftSpot.lng,
        localSpotId: draftSpot.id
      });

      setDraftSpot({
        ...draftSpot,
        status: "submitted_to_osm",
        osmUrl: result.osmUrl,
        osmNodeId: result.nodeId,
        osmChangesetId: result.changesetId
      });

      setMessage(`Koperta wysłana do OSM. Node: ${result.nodeId || "brak danych"}.`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Nie udało się wysłać koperty do OSM.";

      setMessage(errorMessage);
    } finally {
      setSubmitLoading(false);
    }
  }

  const userLngLat = currentPosition ? positionToLngLat(currentPosition) : null;
  const recommendedLngLat = featureToLngLat(routeResult?.recommendedSpot);
  const draftLngLat = draftSpot ? ([draftSpot.lng, draftSpot.lat] as LngLat) : null;
  const destinationLngLat =
    routeResult?.destination
      ? ([routeResult.destination.lng, routeResult.destination.lat] as LngLat)
      : null;

  const routeLabel = routeResult?.routeSummary
    ? `${routeResult.routeSummary.distanceLabel} · ${routeResult.routeSummary.durationLabel}`
    : null;

  return (
    <View style={styles.screen}>
      <Map
        style={styles.map}
        mapStyle={OSM_RASTER_STYLE}
        attribution
        logo={false}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: DEFAULT_CENTER,
            zoom: 5
          }}
        />

        <UserLocation animated accuracy heading />

        {userLngLat ? (
          <Marker id="user" lngLat={userLngLat}>
            <View style={styles.userMarker}>
              <View style={styles.userMarkerInner} />
            </View>
          </Marker>
        ) : null}

        {destinationLngLat ? (
          <Marker id="destination" lngLat={destinationLngLat}>
            <View style={styles.destinationMarker}>
              <Text style={styles.markerText}>C</Text>
            </View>
          </Marker>
        ) : null}

        {recommendedLngLat ? (
          <Marker id="recommended" lngLat={recommendedLngLat}>
            <View style={styles.parkingMarker}>
              <Text style={styles.markerText}>♿</Text>
            </View>
          </Marker>
        ) : null}

        {draftLngLat ? (
          <Marker id="draft" lngLat={draftLngLat}>
            <View style={styles.draftMarker}>
              <Text style={styles.markerText}>+</Text>
            </View>
          </Marker>
        ) : null}

        {nearbyParking.map((feature, index) => {
          const coordinate = featureToLngLat(feature);

          if (!coordinate) {
            return null;
          }

          return (
            <Marker
              key={getFeatureKey(feature, index)}
              id={getFeatureKey(feature, index)}
              lngLat={coordinate}
            >
              <View style={styles.smallParkingMarker}>
                <Text style={styles.smallMarkerText}>P</Text>
              </View>
            </Marker>
          );
        })}

        {routeLine.length > 1 ? (
          <GeoJSONSource id="route-source" data={routeGeoJson}>
            <Layer
              id="route-line"
              type="line"
              source="route-source"
              layout={{
                "line-cap": "round",
                "line-join": "round"
              } as never}
              paint={{
                "line-color": "#111827",
                "line-width": 5,
                "line-opacity": 0.92
              } as never}
            />
          </GeoJSONSource>
        ) : null}
      </Map>

      <SafeAreaView pointerEvents="box-none" style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
          style={styles.overlay}
        >
          {!navigationActive ? (
            <View style={styles.topSearch}>
              <View style={styles.searchPill}>
                <Text style={styles.searchIcon}>⌕</Text>
                <TextInput
                  value={destinationQuery}
                  onChangeText={setDestinationQuery}
                  placeholder="Wyszukaj tutaj"
                  placeholderTextColor="#94a3b8"
                  returnKeyType="search"
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  onSubmitEditing={handleFindRoute}
                  style={styles.searchInput}
                />
                <Text style={styles.micIcon}>🎙</Text>
              </View>

              {searchFocused ? (
                <View style={styles.searchHelp}>
                  <Text style={styles.searchHelpTitle}>Cel podróży</Text>
                  <Text style={styles.searchHelpText}>
                    Wpisz adres lub nazwę miejsca. Po zatwierdzeniu znajdę kopertę przy celu.
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {!searchFocused ? (
            <View style={styles.sideButtons}>
              <Pressable style={styles.sideButton} onPress={handleUseLocation}>
                <Text style={styles.sideButtonText}>⌖</Text>
              </Pressable>

              {navigationActive ? (
                <Pressable style={styles.sideButton} onPress={toggleCameraMode}>
                  <Text style={styles.sideModeText}>
                    {cameraMode === "heading" ? "↟" : "N"}
                  </Text>
                </Pressable>
              ) : (
                <Pressable style={styles.sideButton} onPress={handleAddDraftEnvelope}>
                  <Text style={styles.sideButtonText}>＋</Text>
                </Pressable>
              )}
            </View>
          ) : null}

          {!searchFocused ? (
            navigationActive ? (
              <View style={styles.navigationBar}>
                <View style={styles.navigationInfo}>
                  <Text style={styles.navigationTitle}>
                    {cameraMode === "heading" ? "Nawigacja · przodem" : "Nawigacja · północ"}
                  </Text>
                  <Text style={styles.navigationMessage} numberOfLines={1}>
                    {message}
                  </Text>
                  {routeLabel ? (
                    <Text style={styles.navigationMeta}>{routeLabel}</Text>
                  ) : null}
                </View>

                <Pressable style={styles.stopButton} onPress={handleStopNavigation}>
                  <Text style={styles.stopButtonText}>Stop</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.bottomSheet}>
                <View style={styles.statusRow}>
                  <View style={styles.statusTextBox}>
                    <Text style={styles.statusTitle}>
                      {routeResult ? "Trasa gotowa" : "Gdzie ta koperta?"}
                    </Text>
                    <Text style={styles.statusMessage} numberOfLines={2}>
                      {loading ? "Pracuję..." : message}
                    </Text>
                    {routeLabel ? (
                      <Text style={styles.statusMeta}>Trasa: {routeLabel}</Text>
                    ) : null}
                    {voiceError ? (
                      <Text style={styles.errorText} numberOfLines={1}>
                        {voiceError}
                      </Text>
                    ) : null}
                  </View>

                  {loading ? <ActivityIndicator /> : null}
                </View>

                <View style={styles.mainActions}>
                  <Pressable
                    style={styles.actionButton}
                    onPress={handleUseLocation}
                    disabled={loading}
                  >
                    <Text style={styles.actionButtonText}>Lokalizacja</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.actionButton, styles.addButton]}
                    onPress={handleAddDraftEnvelope}
                    disabled={loading}
                  >
                    <Text style={styles.addButtonText}>Dodaj</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.actionButton,
                      styles.navButton,
                      !routeResult ? styles.disabledButton : null
                    ]}
                    onPress={handleStartNavigation}
                    disabled={!routeResult || loading}
                  >
                    <Text style={styles.navButtonText}>Nawiguj</Text>
                  </Pressable>
                </View>

                <View style={styles.secondaryActions}>
                  <Pressable
                    style={styles.osmButton}
                    onPress={handleOsmLoginOrLogout}
                    disabled={loading}
                  >
                    <Text style={styles.osmButtonText}>
                      {osmUser ? "OSM połączone" : "Zaloguj OSM"}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.submitButton,
                      (!draftSpot || submitLoading) ? styles.disabledButton : null
                    ]}
                    onPress={handleSubmitDraftEnvelope}
                    disabled={!draftSpot || submitLoading}
                  >
                    {submitLoading ? (
                      <ActivityIndicator />
                    ) : (
                      <Text style={styles.submitButtonText}>Wyślij do OSM</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#dbeafe"
  },
  map: {
    ...StyleSheet.absoluteFillObject
  },
  safeArea: {
    flex: 1
  },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 12
  },
  topSearch: {
    paddingTop: 8
  },
  searchPill: {
    minHeight: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.96)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8
  },
  searchIcon: {
    color: "#111827",
    fontSize: 25,
    fontWeight: "900"
  },
  searchInput: {
    flex: 1,
    color: "#0f172a",
    fontSize: 19,
    fontWeight: "800",
    paddingVertical: 0
  },
  micIcon: {
    fontSize: 22
  },
  searchHelp: {
    marginTop: 12,
    backgroundColor: "rgba(17,17,17,0.92)",
    borderRadius: 20,
    padding: 16,
    gap: 6
  },
  searchHelpTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900"
  },
  searchHelpText: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 20
  },
  sideButtons: {
    position: "absolute",
    right: 14,
    top: 96,
    gap: 10
  },
  sideButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.96)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 7
  },
  sideButtonText: {
    color: "#0f172a",
    fontSize: 25,
    fontWeight: "900"
  },
  sideModeText: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900"
  },
  bottomSheet: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 28,
    padding: 14,
    gap: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 9
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  statusTextBox: {
    flex: 1
  },
  statusTitle: {
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1
  },
  statusMessage: {
    color: "#0f172a",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
    marginTop: 4
  },
  statusMeta: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4
  },
  mainActions: {
    flexDirection: "row",
    gap: 8
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 18,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },
  actionButtonText: {
    color: "#1e293b",
    fontSize: 13,
    fontWeight: "900"
  },
  addButton: {
    backgroundColor: "#16a34a"
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  navButton: {
    backgroundColor: "#2563eb"
  },
  navButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  secondaryActions: {
    flexDirection: "row",
    gap: 8
  },
  osmButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 17,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },
  osmButtonText: {
    color: "#166534",
    fontSize: 13,
    fontWeight: "900"
  },
  submitButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 17,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  navigationBar: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 26,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 9
  },
  navigationInfo: {
    flex: 1
  },
  navigationTitle: {
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1
  },
  navigationMessage: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2
  },
  navigationMeta: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3
  },
  stopButton: {
    minHeight: 44,
    borderRadius: 18,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20
  },
  stopButtonText: {
    color: "#991b1b",
    fontSize: 15,
    fontWeight: "900"
  },
  userMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(37,99,235,0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff"
  },
  userMarkerInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#2563eb"
  },
  parkingMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff"
  },
  smallParkingMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ffffff"
  },
  draftMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#f97316",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff"
  },
  destinationMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff"
  },
  markerText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900"
  },
  smallMarkerText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900"
  },
  disabledButton: {
    opacity: 0.45
  }
});
