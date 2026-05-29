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
import MapView, {
  Marker,
  Polyline,
  type LatLng,
  type Region
} from "react-native-maps";

import {
  fetchNearbyParking,
  formatDistanceMeters,
  getParkingFeatureTitle,
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

const DEFAULT_REGION: Region = {
  latitude: 52.237049,
  longitude: 21.017532,
  latitudeDelta: 5.8,
  longitudeDelta: 5.8
};

function toLatLng(position: Position): LatLng {
  return {
    latitude: position.lat,
    longitude: position.lng
  };
}

function featureToLatLng(feature?: ParkingFeature | null): LatLng | null {
  const coordinates = feature?.geometry?.coordinates;

  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    latitude: lat,
    longitude: lng
  };
}

function unknownRouteCoordinateToLatLng(value: unknown): LatLng | null {
  if (Array.isArray(value)) {
    const lng = Number(value[0]);
    const lat = Number(value[1]);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return {
        latitude: lat,
        longitude: lng
      };
    }

    return null;
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const lat = Number(record.lat ?? record.latitude);
    const lng = Number(record.lng ?? record.longitude);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return {
        latitude: lat,
        longitude: lng
      };
    }
  }

  return null;
}

function routeCoordinatesToLatLng(values?: unknown[]) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map(unknownRouteCoordinateToLatLng)
    .filter((coordinate): coordinate is LatLng => Boolean(coordinate));
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

function makeRegion(center: LatLng, zoomed = true): Region {
  return {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: zoomed ? 0.035 : 5.8,
    longitudeDelta: zoomed ? 0.035 : 5.8
  };
}

export default function HomeScreen() {
  const mapRef = useRef<MapView | null>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);

  const [destinationQuery, setDestinationQuery] = useState("");
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>(DEFAULT_REGION);

  const [nearbyParking, setNearbyParking] = useState<ParkingFeature[]>([]);
  const [routeResult, setRouteResult] = useState<RouteAssistantResponse | null>(null);
  const [draftSpot, setDraftSpot] = useState<DraftSpot | null>(null);

  const [osmUser, setOsmUser] = useState<OsmMobileUser | null>(null);
  const [message, setMessage] = useState("Wpisz cel podróży albo użyj lokalizacji.");
  const [loading, setLoading] = useState(false);
  const [navigationActive, setNavigationActive] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(true);

  const { playVoiceCommand, voiceError } = useNavigationVoice();

  useEffect(() => {
    let mounted = true;

    async function loadOsmUser() {
      try {
        const me = await getOsmMe();

        if (!mounted) {
          return;
        }

        if (me.authenticated && me.user) {
          setOsmUser(me.user);
        } else {
          setOsmUser(null);
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

      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
    };
  }, []);

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

    const nextRegion = makeRegion(toLatLng(nextPosition));
    setMapRegion(nextRegion);

    mapRef.current?.animateToRegion(nextRegion, 450);

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
      Keyboard.dismiss();
      setLoading(true);
      setMessage("Pobieram lokalizację...");

      const position = await requestPosition();
      const response = await loadNearbyParking(position);

      setMessage(`Znaleziono ${response.features.length} kopert w promieniu 5 km.`);
      setPanelExpanded(true);
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

    try {
      Keyboard.dismiss();
      setLoading(true);
      setPanelExpanded(true);
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

      const recommendedCoordinate = featureToLatLng(response.recommendedSpot);

      if (recommendedCoordinate) {
        mapRef.current?.animateToRegion(makeRegion(recommendedCoordinate), 500);
      }
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
      Keyboard.dismiss();
      setLoading(true);

      const position = currentPosition || (await requestPosition());

      setNavigationActive(true);
      setPanelExpanded(false);
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
          mapRef.current?.animateToRegion(makeRegion(toLatLng(updated)), 300);
        }
      );

      mapRef.current?.animateToRegion(makeRegion(toLatLng(position)), 300);
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
    setPanelExpanded(true);
    setMessage("Nawigacja zatrzymana.");
    playVoiceCommand("nav_navigation_stop");
  }

  async function handleAddDraftEnvelope() {
    try {
      Keyboard.dismiss();
      setLoading(true);

      const position = currentPosition || (await requestPosition());

      const draft: DraftSpot = {
        id: `mobile-${Date.now()}`,
        lat: position.lat,
        lng: position.lng,
        status: "draft"
      };

      setDraftSpot(draft);
      setMessage("Dodano szkic koperty z aktualnej pozycji.");
      setPanelExpanded(true);

      mapRef.current?.animateToRegion(makeRegion(toLatLng(position)), 300);
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
      Keyboard.dismiss();
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
      Keyboard.dismiss();
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

      const submittedDraft: DraftSpot = {
        ...draftSpot,
        status: "submitted_to_osm",
        osmUrl: result.osmUrl,
        osmNodeId: result.nodeId,
        osmChangesetId: result.changesetId
      };

      setDraftSpot(submittedDraft);
      setMessage(`Koperta wysłana do OSM. Node: ${result.nodeId || "brak danych"}.`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Nie udało się wysłać koperty do OSM.";

      setMessage(errorMessage);
    } finally {
      setSubmitLoading(false);
    }
  }

  const userCoordinate = currentPosition ? toLatLng(currentPosition) : null;
  const recommendedCoordinate = featureToLatLng(routeResult?.recommendedSpot);
  const draftCoordinate = draftSpot
    ? {
        latitude: draftSpot.lat,
        longitude: draftSpot.lng
      }
    : null;

  const routeLine = useMemo(() => {
    if (!routeResult) {
      return [];
    }

    const toSpot = routeCoordinatesToLatLng(routeResult.routeToSpotCoordinates);

    if (toSpot.length > 1) {
      return toSpot;
    }

    const primary = routeCoordinatesToLatLng(routeResult.routeCoordinates);

    if (primary.length > 1) {
      return primary;
    }

    return routeCoordinatesToLatLng(routeResult.routeToDestinationCoordinates);
  }, [routeResult]);

  const destinationCoordinate =
    routeResult?.destination
      ? {
          latitude: routeResult.destination.lat,
          longitude: routeResult.destination.lng
        }
      : null;

  const routeLabel = routeResult?.routeSummary
    ? `${routeResult.routeSummary.distanceLabel} · ${routeResult.routeSummary.durationLabel}`
    : null;

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={styles.map}
        region={mapRegion}
        onRegionChangeComplete={setMapRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {userCoordinate ? (
          <Marker coordinate={userCoordinate} title="Twoja pozycja" pinColor="#2563eb" />
        ) : null}

        {destinationCoordinate ? (
          <Marker coordinate={destinationCoordinate} title="Cel podróży" />
        ) : null}

        {recommendedCoordinate ? (
          <Marker
            coordinate={recommendedCoordinate}
            title="Rekomendowana koperta"
            description={routeResult?.spotDistanceToDestinationLabel || undefined}
            pinColor="#16a34a"
          />
        ) : null}

        {draftCoordinate ? (
          <Marker
            coordinate={draftCoordinate}
            title={
              draftSpot?.status === "submitted_to_osm"
                ? "Koperta wysłana do OSM"
                : "Szkic koperty"
            }
            pinColor="#f97316"
          />
        ) : null}

        {nearbyParking.map((feature, index) => {
          const coordinate = featureToLatLng(feature);

          if (!coordinate) {
            return null;
          }

          return (
            <Marker
              key={getFeatureKey(feature, index)}
              coordinate={coordinate}
              title={getParkingFeatureTitle(feature)}
              description={formatDistanceMeters(feature.properties?.distanceMeters)}
              pinColor="#0f766e"
            />
          );
        })}

        {routeLine.length > 1 ? (
          <Polyline coordinates={routeLine} strokeWidth={5} />
        ) : null}
      </MapView>

      <SafeAreaView pointerEvents="box-none" style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
          style={styles.overlay}
        >
          {navigationActive && !panelExpanded ? (
            <View style={styles.miniPanel}>
              <Pressable
                style={styles.miniInfo}
                onPress={() => setPanelExpanded(true)}
              >
                <Text style={styles.miniTitle}>Nawigacja</Text>
                <Text style={styles.miniText} numberOfLines={1}>
                  {routeLabel || message}
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.miniStopButton,
                  pressed ? styles.buttonPressed : null
                ]}
                onPress={handleStopNavigation}
              >
                <Text style={styles.miniStopText}>Stop</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.bottomSheet}>
              <View style={styles.sheetHandle} />

              <Text style={styles.label}>Cel podróży</Text>

              <View style={styles.inputRow}>
                <TextInput
                  value={destinationQuery}
                  onChangeText={setDestinationQuery}
                  placeholder="Dokąd jedziesz?"
                  placeholderTextColor="#94a3b8"
                  returnKeyType="search"
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
                <Text style={styles.errorText} numberOfLines={1}>
                  {voiceError}
                </Text>
              ) : null}

              <View style={styles.compactActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.compactButton,
                    pressed ? styles.buttonPressed : null
                  ]}
                  onPress={handleUseLocation}
                  disabled={loading}
                >
                  <Text style={styles.compactButtonText}>Lokalizacja</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.compactButton,
                    styles.addButton,
                    pressed ? styles.buttonPressed : null
                  ]}
                  onPress={handleAddDraftEnvelope}
                  disabled={loading}
                >
                  <Text style={styles.addButtonText}>Dodaj</Text>
                </Pressable>

                {navigationActive ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.compactButton,
                      styles.stopButton,
                      pressed ? styles.buttonPressed : null
                    ]}
                    onPress={handleStopNavigation}
                  >
                    <Text style={styles.stopButtonText}>Stop</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={({ pressed }) => [
                      styles.compactButton,
                      styles.navButton,
                      (!routeResult || loading) ? styles.disabledButton : null,
                      pressed ? styles.buttonPressed : null
                    ]}
                    onPress={handleStartNavigation}
                    disabled={!routeResult || loading}
                  >
                    <Text style={styles.navButtonText}>Nawiguj</Text>
                  </Pressable>
                )}
              </View>

              <View style={styles.secondaryActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed ? styles.buttonPressed : null
                  ]}
                  onPress={handleOsmLoginOrLogout}
                  disabled={loading}
                >
                  <Text style={styles.secondaryButtonText}>
                    {osmUser ? "OSM połączone" : "Zaloguj OSM"}
                  </Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.secondaryButton,
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

              {routeLabel ? (
                <Text style={styles.metaText}>Trasa: {routeLabel}</Text>
              ) : null}

              {draftSpot ? (
                <Text style={styles.metaText}>
                  Szkic: {draftSpot.status === "submitted_to_osm" ? "wysłany" : "lokalny"}
                </Text>
              ) : null}

              {navigationActive ? (
                <Pressable
                  style={styles.collapseButton}
                  onPress={() => setPanelExpanded(false)}
                >
                  <Text style={styles.collapseButtonText}>Schowaj panel</Text>
                </Pressable>
              ) : null}
            </View>
          )}
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
    paddingHorizontal: 14,
    paddingBottom: 12
  },
  bottomSheet: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 28,
    padding: 14,
    gap: 9,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 8
  },
  sheetHandle: {
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#cbd5e1",
    alignSelf: "center",
    marginBottom: 2
  },
  label: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  input: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 13,
    fontSize: 16,
    color: "#0f172a",
    fontWeight: "700"
  },
  showButton: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 17
  },
  showButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900"
  },
  message: {
    color: "#334155",
    fontSize: 13,
    lineHeight: 19
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 12,
    fontWeight: "800"
  },
  compactActions: {
    flexDirection: "row",
    gap: 7
  },
  compactButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 15,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  compactButtonText: {
    color: "#1e293b",
    fontSize: 12,
    fontWeight: "900"
  },
  addButton: {
    backgroundColor: "#16a34a"
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  navButton: {
    backgroundColor: "#2563eb"
  },
  navButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  stopButton: {
    backgroundColor: "#fee2e2"
  },
  stopButtonText: {
    color: "#991b1b",
    fontSize: 12,
    fontWeight: "900"
  },
  secondaryActions: {
    flexDirection: "row",
    gap: 7
  },
  secondaryButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 15,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },
  secondaryButtonText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "900"
  },
  submitButton: {
    backgroundColor: "#2563eb"
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  disabledButton: {
    opacity: 0.42
  },
  buttonPressed: {
    opacity: 0.72
  },
  metaText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "800"
  },
  collapseButton: {
    alignSelf: "center",
    paddingVertical: 3,
    paddingHorizontal: 10
  },
  collapseButtonText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800"
  },
  miniPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 24,
    padding: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 8
  },
  miniInfo: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  miniTitle: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7
  },
  miniText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800"
  },
  miniStopButton: {
    minHeight: 42,
    borderRadius: 16,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20
  },
  miniStopText: {
    color: "#991b1b",
    fontSize: 13,
    fontWeight: "900"
  }
});
