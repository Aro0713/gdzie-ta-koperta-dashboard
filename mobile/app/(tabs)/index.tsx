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

const DEFAULT_CENTER: LngLat = [21.017532, 52.237049];

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

export default function HomeScreen() {
  const cameraRef = useRef<CameraRef | null>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);

  const [destinationQuery, setDestinationQuery] = useState("");
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [nearbyParking, setNearbyParking] = useState<ParkingFeature[]>([]);
  const [routeResult, setRouteResult] = useState<RouteAssistantResponse | null>(null);
  const [draftSpot, setDraftSpot] = useState<DraftSpot | null>(null);

  const [osmUser, setOsmUser] = useState<OsmMobileUser | null>(null);
  const [message, setMessage] = useState("Dokąd jedziesz?");
  const [loading, setLoading] = useState(false);
  const [navigationActive, setNavigationActive] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const { playVoiceCommand, voiceError } = useNavigationVoice();

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

    const keyboardShow = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
      setSheetExpanded(true);
    });

    const keyboardHide = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
    });

    void loadOsmUser();

    return () => {
      mounted = false;
      keyboardShow.remove();
      keyboardHide.remove();

      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
    };
  }, []);

  function focusPoint(point: LngLat, zoom = 15) {
    cameraRef.current?.easeTo({
      center: point,
      duration: 450
    });

    cameraRef.current?.zoomTo(zoom, {
      duration: 450
    });
  }

  function fitRoute(points: LngLat[]) {
    const bounds = getLngLatBounds(points);

    if (!bounds) {
      return;
    }

    cameraRef.current?.fitBounds(bounds, {
      padding: {
        top: 80,
        right: 40,
        bottom: 260,
        left: 40
      },
      duration: 700
    });
  }

  async function requestPosition() {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== "granted") {
      throw new Error("Brak zgody na lokalizację.");
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });

    const nextPosition: Position = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy
    };

    setCurrentPosition(nextPosition);
    focusPoint(positionToLngLat(nextPosition), 15);

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

  async function handleUseLocation() {
    try {
      setLoading(true);
      setMessage("Pobieram lokalizację...");

      const position = await requestPosition();
      const response = await loadNearbyParking(position);

      setMessage(`Znaleziono ${response.features.length} kopert w promieniu 5 km.`);
      setSheetExpanded(true);
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
      setSheetExpanded(true);
      return;
    }

    Keyboard.dismiss();

    try {
      setLoading(true);
      setMessage("Szukam celu, koperty i trasy...");
      playVoiceCommand("nav_route_calculating");

      const position = currentPosition || (await requestPosition());

      const response = await fetchRouteAssistant({
        query,
        userLat: position.lat,
        userLng: position.lng,
        localSpots: draftSpot
          ? [
              {
                id: draftSpot.id,
                lat: draftSpot.lat,
                lng: draftSpot.lng,
                status: draftSpot.status,
                osmUrl: draftSpot.osmUrl || null,
                osmNodeId: draftSpot.osmNodeId || null,
                addedByName: osmUser?.displayName || null
              }
            ]
          : []
      });

      setRouteResult(response);

      if (response.recommendedSpot) {
        setMessage(
          `Prowadzę do koperty. ${response.spotDistanceToDestinationLabel || ""} od celu.`
        );
        playVoiceCommand("gtk_found_parking");
      } else {
        setMessage("Nie znaleziono koperty przy celu. Prowadzę do wskazanego adresu.");
        playVoiceCommand("nav_route_ready");
      }

      const route = routeCoordinatesToLngLat(
        response.routeToSpotCoordinates?.length
          ? response.routeToSpotCoordinates
          : response.routeCoordinates
      );

      if (route.length > 1) {
        fitRoute(route);
      } else {
        const recommended = featureToLngLat(response.recommendedSpot);
        const destination = response.destination
          ? ([response.destination.lng, response.destination.lat] as LngLat)
          : null;

        if (recommended || destination) {
          focusPoint(recommended || destination!, 15);
        }
      }

      setSheetExpanded(true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Nie udało się wyznaczyć trasy.";

      setMessage(errorMessage);
      playVoiceCommand("route_no_route_found");
      setSheetExpanded(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleStartNavigation() {
    if (!routeResult) {
      setMessage("Najpierw wyznacz trasę.");
      setSheetExpanded(true);
      return;
    }

    try {
      setLoading(true);
      Keyboard.dismiss();

      const position = currentPosition || (await requestPosition());

      setNavigationActive(true);
      setSheetExpanded(false);
      setMessage("Nawigacja uruchomiona.");
      playVoiceCommand("nav_navigation_start");

      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }

      locationWatchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 2500,
          distanceInterval: 8
        },
        (nextPosition) => {
          const updated: Position = {
            lat: nextPosition.coords.latitude,
            lng: nextPosition.coords.longitude,
            accuracy: nextPosition.coords.accuracy
          };

          setCurrentPosition(updated);
          focusPoint(positionToLngLat(updated), 16);
        }
      );

      focusPoint(positionToLngLat(position), 16);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Nie udało się uruchomić nawigacji.";

      setMessage(errorMessage);
      playVoiceCommand("route_network_error");
      setSheetExpanded(true);
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
    setSheetExpanded(true);
    setMessage("Nawigacja zatrzymana.");
    playVoiceCommand("nav_navigation_stop");
  }

  async function handleAddDraftEnvelope() {
    try {
      setLoading(true);
      Keyboard.dismiss();

      const position = currentPosition || (await requestPosition());

      const draft: DraftSpot = {
        id: `mobile-${Date.now()}`,
        lat: position.lat,
        lng: position.lng,
        status: "draft"
      };

      setDraftSpot(draft);
      setMessage("Dodano szkic koperty z aktualnej pozycji.");
      setSheetExpanded(true);
      focusPoint(positionToLngLat(position), 16);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Nie udało się dodać szkicu koperty.";

      setMessage(errorMessage);
      setSheetExpanded(true);
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
      setSheetExpanded(true);
    }
  }

  async function handleSubmitDraftEnvelope() {
    if (!draftSpot) {
      setMessage("Najpierw dodaj szkic koperty.");
      setSheetExpanded(true);
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
      setSheetExpanded(true);
    }
  }

  const userLngLat = currentPosition ? positionToLngLat(currentPosition) : null;
  const recommendedLngLat = featureToLngLat(routeResult?.recommendedSpot);
  const draftLngLat = draftSpot ? ([draftSpot.lng, draftSpot.lat] as LngLat) : null;
  const destinationLngLat =
    routeResult?.destination
      ? ([routeResult.destination.lng, routeResult.destination.lat] as LngLat)
      : null;

  const routeLine = useMemo(() => {
    if (!routeResult) {
      return [];
    }

    const toSpot = routeCoordinatesToLngLat(routeResult.routeToSpotCoordinates);

    if (toSpot.length > 1) {
      return toSpot;
    }

    const primary = routeCoordinatesToLngLat(routeResult.routeCoordinates);

    if (primary.length > 1) {
      return primary;
    }

    return routeCoordinatesToLngLat(routeResult.routeToDestinationCoordinates);
  }, [routeResult]);

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

  const routeLabel = routeResult?.routeSummary
    ? `${routeResult.routeSummary.distanceLabel} · ${routeResult.routeSummary.durationLabel}`
    : null;

  const showExpandedSheet = sheetExpanded && !navigationActive;
  const showCompactSheet = !showExpandedSheet && !navigationActive;

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
            <Marker key={getFeatureKey(feature, index)} id={getFeatureKey(feature, index)} lngLat={coordinate}>
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
          {navigationActive ? (
            <View style={styles.navigationHud}>
              <Pressable
                style={styles.hudHandleArea}
                onPress={() => setSheetExpanded((current) => !current)}
              >
                <View style={styles.handle} />
              </Pressable>

              <View style={styles.navigationHudRow}>
                <View style={styles.navigationHudText}>
                  <Text style={styles.hudTitle}>Nawigacja</Text>
                  <Text style={styles.hudMessage} numberOfLines={2}>
                    {message}
                  </Text>
                  {routeLabel ? (
                    <Text style={styles.hudMeta}>{routeLabel}</Text>
                  ) : null}
                </View>

                <Pressable style={styles.hudStopButton} onPress={handleStopNavigation}>
                  <Text style={styles.hudStopButtonText}>Stop</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {showCompactSheet ? (
            <View style={styles.compactSheet}>
              <Pressable
                style={styles.hudHandleArea}
                onPress={() => setSheetExpanded(true)}
              >
                <View style={styles.handle} />
              </Pressable>

              <Pressable
                style={styles.compactSearch}
                onPress={() => setSheetExpanded(true)}
              >
                <Text style={styles.compactSearchIcon}>⌕</Text>
                <Text style={styles.compactSearchText} numberOfLines={1}>
                  {destinationQuery || "Dokąd jedziesz?"}
                </Text>
              </Pressable>

              <View style={styles.compactActions}>
                <Pressable style={styles.compactActionButton} onPress={handleUseLocation}>
                  <Text style={styles.compactActionText}>Lokalizacja</Text>
                </Pressable>

                <Pressable
                  style={[styles.compactActionButton, styles.compactAddButton]}
                  onPress={handleAddDraftEnvelope}
                >
                  <Text style={styles.compactAddText}>Dodaj</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.compactActionButton,
                    styles.compactNavButton,
                    !routeResult ? styles.disabledButton : null
                  ]}
                  onPress={handleStartNavigation}
                  disabled={!routeResult || loading}
                >
                  <Text style={styles.compactNavText}>Nawiguj</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {showExpandedSheet ? (
            <View style={styles.expandedSheet}>
              <Pressable
                style={styles.hudHandleArea}
                onPress={() => {
                  Keyboard.dismiss();
                  setSheetExpanded(false);
                }}
              >
                <View style={styles.handle} />
              </Pressable>

              <Text style={styles.label}>Cel podróży</Text>

              <View style={styles.inputRow}>
                <TextInput
                  value={destinationQuery}
                  onChangeText={setDestinationQuery}
                  placeholder="Dokąd jedziesz?"
                  placeholderTextColor="#94a3b8"
                  returnKeyType="search"
                  onFocus={() => setSheetExpanded(true)}
                  onSubmitEditing={handleFindRoute}
                  style={styles.input}
                />

                <Pressable
                  style={({ pressed }) => [
                    styles.showButton,
                    pressed ? styles.buttonPressed : null
                  ]}
                  onPress={handleFindRoute}
                  disabled={loading}
                >
                  <Text style={styles.showButtonText}>Pokaż</Text>
                </Pressable>
              </View>

              <Text style={styles.message} numberOfLines={2}>
                {loading ? "Pracuję..." : message}
              </Text>

              {voiceError ? (
                <Text style={styles.errorText} numberOfLines={2}>
                  {voiceError}
                </Text>
              ) : null}

              {routeLabel ? (
                <Text style={styles.routeMeta}>Trasa: {routeLabel}</Text>
              ) : null}

              {draftSpot ? (
                <Text style={styles.routeMeta}>
                  Szkic: {draftSpot.status === "submitted_to_osm" ? "wysłany do OSM" : "lokalny"}
                </Text>
              ) : null}

              {!keyboardVisible ? (
                <>
                  <View style={styles.mainActions}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.actionButton,
                        pressed ? styles.buttonPressed : null
                      ]}
                      onPress={handleUseLocation}
                      disabled={loading}
                    >
                      <Text style={styles.actionText}>Lokalizacja</Text>
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [
                        styles.actionButton,
                        styles.addButton,
                        pressed ? styles.buttonPressed : null
                      ]}
                      onPress={handleAddDraftEnvelope}
                      disabled={loading}
                    >
                      <Text style={styles.addButtonText}>Dodaj</Text>
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [
                        styles.actionButton,
                        styles.navButton,
                        !routeResult ? styles.disabledButton : null,
                        pressed ? styles.buttonPressed : null
                      ]}
                      onPress={handleStartNavigation}
                      disabled={!routeResult || loading}
                    >
                      <Text style={styles.navButtonText}>Nawiguj</Text>
                    </Pressable>
                  </View>

                  <View style={styles.osmActions}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.osmButton,
                        pressed ? styles.buttonPressed : null
                      ]}
                      onPress={handleOsmLoginOrLogout}
                      disabled={loading}
                    >
                      <Text style={styles.osmButtonText}>
                        {osmUser ? `OSM: ${osmUser.displayName || osmUser.id}` : "Zaloguj OSM"}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [
                        styles.submitButton,
                        (!draftSpot || submitLoading) ? styles.disabledButton : null,
                        pressed ? styles.buttonPressed : null
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
                </>
              ) : null}
            </View>
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
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 12
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.28)",
    alignSelf: "center"
  },
  hudHandleArea: {
    paddingTop: 8,
    paddingBottom: 10
  },
  compactSheet: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingBottom: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 8
  },
  compactSearch: {
    minHeight: 48,
    borderRadius: 20,
    backgroundColor: "rgba(15,23,42,0.08)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10
  },
  compactSearchIcon: {
    fontSize: 26,
    color: "#0f172a",
    fontWeight: "700"
  },
  compactSearchText: {
    flex: 1,
    color: "#334155",
    fontSize: 18,
    fontWeight: "800"
  },
  compactActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10
  },
  compactActionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 18,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },
  compactActionText: {
    color: "#1e293b",
    fontSize: 13,
    fontWeight: "900"
  },
  compactAddButton: {
    backgroundColor: "#16a34a"
  },
  compactAddText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  compactNavButton: {
    backgroundColor: "#2563eb"
  },
  compactNavText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  expandedSheet: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingBottom: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 9
  },
  label: {
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  input: {
    flex: 1,
    minHeight: 52,
    borderRadius: 20,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 14,
    fontSize: 18,
    color: "#0f172a",
    fontWeight: "800"
  },
  showButton: {
    minHeight: 52,
    borderRadius: 20,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20
  },
  showButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900"
  },
  message: {
    color: "#334155",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10
  },
  routeMeta: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 6
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4
  },
  mainActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12
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
  actionText: {
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
  osmActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8
  },
  osmButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 18,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  osmButtonText: {
    color: "#166534",
    fontSize: 13,
    fontWeight: "900"
  },
  submitButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 18,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  navigationHud: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingBottom: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 9
  },
  navigationHudRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  navigationHudText: {
    flex: 1
  },
  hudTitle: {
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1
  },
  hudMessage: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 3
  },
  hudMeta: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3
  },
  hudStopButton: {
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20
  },
  hudStopButtonText: {
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
  },
  buttonPressed: {
    opacity: 0.72
  }
});