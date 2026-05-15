import * as Location from "expo-location";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import MapView, { Marker, Polyline, type LatLng } from "react-native-maps";

import {
  fetchNearbyParking,
  formatDistanceMeters,
  getParkingFeatureTitle,
  type ParkingFeature,
  type ParkingResponse
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

type LocationState =
  | {
      status: "idle";
      message: string;
    }
  | {
      status: "loading";
      message: string;
    }
  | {
      status: "ready";
      latitude: number;
      longitude: number;
      accuracy: number | null;
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

type NearbyState =
  | {
      status: "idle";
      message: string;
    }
  | {
      status: "loading";
      message: string;
    }
  | {
      status: "ready";
      message: string;
      response: ParkingResponse;
      visibleFeatures: ParkingFeature[];
    }
  | {
      status: "error";
      message: string;
    };

type RouteState =
  | {
      status: "idle";
      message: string;
    }
  | {
      status: "loading";
      message: string;
    }
  | {
      status: "ready";
      message: string;
      response: RouteAssistantResponse;
    }
  | {
      status: "error";
      message: string;
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

function getFeatureKey(feature: ParkingFeature, index: number) {
  const properties = feature.properties || {};
  const osmType = properties.osmType || "node";
  const osmId = properties.osmId;

  if (osmId !== undefined && osmId !== null) {
    return `${osmType}:${osmId}`;
  }

  return `feature:${index}`;
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

function draftToLatLng(draft: DraftSpot | null): LatLng | null {
  if (!draft) {
    return null;
  }

  return {
    latitude: draft.lat,
    longitude: draft.lng
  };
}

function getInitialRegion(center: LatLng | null) {
  return {
    latitude: center?.latitude ?? 52.237049,
    longitude: center?.longitude ?? 21.017532,
    latitudeDelta: center ? 0.035 : 5.8,
    longitudeDelta: center ? 0.035 : 5.8
  };
}

export default function HomeScreen() {
  const [destinationQuery, setDestinationQuery] = useState("");
  const [locationState, setLocationState] = useState<LocationState>({
    status: "idle",
    message: "Podaj cel podróży albo pobierz lokalizację."
  });
  const [nearbyState, setNearbyState] = useState<NearbyState>({
    status: "idle",
    message: "Koperty w okolicy pojawią się po pobraniu lokalizacji."
  });
  const [routeState, setRouteState] = useState<RouteState>({
    status: "idle",
    message: "Wpisz cel, a aplikacja znajdzie kopertę przy celu."
  });
  const [draftSpot, setDraftSpot] = useState<DraftSpot | null>(null);
  const [osmUser, setOsmUser] = useState<OsmMobileUser | null>(null);
  const [osmMessage, setOsmMessage] = useState("Nie połączono z OpenStreetMap.");
  const [osmLoading, setOsmLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

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
          setOsmMessage(`Zalogowano OSM: ${me.user.displayName || me.user.id}`);
        } else {
          setOsmUser(null);
          setOsmMessage("Nie połączono z OpenStreetMap.");
        }
      } catch {
        if (mounted) {
          setOsmUser(null);
          setOsmMessage("Nie połączono z OpenStreetMap.");
        }
      }
    }

    void loadOsmUser();

    return () => {
      mounted = false;
    };
  }, []);

  async function ensureLocation() {
    setLocationState({
      status: "loading",
      message: "Sprawdzam zgodę na lokalizację..."
    });

    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== "granted") {
      const message =
        "Brak zgody na lokalizację. Bez niej nie wyznaczymy trasy do koperty.";

      setLocationState({
        status: "error",
        message
      });

      throw new Error(message);
    }

    setLocationState({
      status: "loading",
      message: "Pobieram aktualną pozycję..."
    });

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });

    const location = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy
    };

    setLocationState({
      status: "ready",
      latitude: location.lat,
      longitude: location.lng,
      accuracy: location.accuracy,
      message: "Lokalizacja gotowa."
    });

    return location;
  }

  async function handleLoadNearbyParking() {
    try {
      const location = await ensureLocation();

      setNearbyState({
        status: "loading",
        message: "Pobieram koperty w promieniu 5 km..."
      });

      const response = await fetchNearbyParking({
        lat: location.lat,
        lng: location.lng,
        radius: 5000
      });

      setNearbyState({
        status: "ready",
        response,
        visibleFeatures: response.features.slice(0, 5),
        message: `Znaleziono ${response.features.length} kopert w promieniu ${
          response.metadata?.radiusMeters ?? 5000
        } m.`
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nie udało się pobrać kopert.";

      setNearbyState({
        status: "error",
        message
      });
    }
  }

  async function handleFindRoute() {
    const query = destinationQuery.trim();

    if (!query) {
      setRouteState({
        status: "error",
        message: "Wpisz cel podróży, np. „Żeromskiego, Sosnowiec”."
      });
      return;
    }

    try {
      const location = await ensureLocation();

      setRouteState({
        status: "loading",
        message: "Szukam celu, koperty i trasy..."
      });

      const response = await fetchRouteAssistant({
        query,
        userLat: location.lat,
        userLng: location.lng,
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

      setRouteState({
        status: "ready",
        response,
        message: response.answer || "Trasa gotowa."
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nie udało się wyznaczyć trasy.";

      setRouteState({
        status: "error",
        message
      });
    }
  }

  async function handleCreateDraftSpot() {
    try {
      const location = await ensureLocation();
      const draft: DraftSpot = {
        id: `mobile-${Date.now()}`,
        lat: location.lat,
        lng: location.lng,
        status: "draft"
      };

      setDraftSpot(draft);
      setOsmMessage(
        "Dodano lokalny szkic koperty. Możesz go wysłać do OSM po zalogowaniu."
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nie udało się utworzyć szkicu.";

      setOsmMessage(message);
    }
  }

  async function handleOsmLogin() {
    try {
      setOsmLoading(true);
      setOsmMessage("Otwieram logowanie OpenStreetMap...");

      const me = await loginWithOsm();

      if (me.authenticated && me.user) {
        setOsmUser(me.user);
        setOsmMessage(`Zalogowano OSM: ${me.user.displayName || me.user.id}`);
      } else {
        setOsmUser(null);
        setOsmMessage("Nie udało się potwierdzić logowania OSM.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nie udało się zalogować OSM.";

      setOsmMessage(message);
    } finally {
      setOsmLoading(false);
    }
  }

  async function handleOsmLogout() {
    await clearStoredOsmSession();
    setOsmUser(null);
    setOsmMessage("Wylogowano z OpenStreetMap w aplikacji mobilnej.");
  }

  async function handleSubmitDraftToOsm() {
    if (!draftSpot) {
      setOsmMessage("Najpierw dodaj lokalny szkic koperty.");
      return;
    }

    try {
      setSubmitLoading(true);
      setOsmMessage("Wysyłam kopertę do OpenStreetMap...");

      if (!osmUser) {
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

      setOsmMessage(
        `Koperta wysłana do OSM. Node: ${result.nodeId}, changeset: ${result.changesetId}.`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nie udało się wysłać koperty.";

      setOsmMessage(message);
    } finally {
      setSubmitLoading(false);
    }
  }

  const userCoordinate =
    locationState.status === "ready"
      ? {
          latitude: locationState.latitude,
          longitude: locationState.longitude
        }
      : null;

  const routeResponse =
    routeState.status === "ready" ? routeState.response : null;

  const recommendedCoordinate = featureToLatLng(routeResponse?.recommendedSpot);
  const draftCoordinate = draftToLatLng(draftSpot);
  const routeLine = useMemo(() => {
    if (!routeResponse) {
      return [];
    }

    const toSpot = routeCoordinatesToLatLng(routeResponse.routeToSpotCoordinates);

    if (toSpot.length > 1) {
      return toSpot;
    }

    return routeCoordinatesToLatLng(routeResponse.routeCoordinates);
  }, [routeResponse]);

  const mapCenter =
    recommendedCoordinate ||
    draftCoordinate ||
    routeLine[0] ||
    userCoordinate ||
    null;

  const mapRegion = getInitialRegion(mapCenter);

  const alternativeMarkers = (routeResponse?.alternatives || [])
    .slice(0, 5)
    .map((feature, index) => ({
      feature,
      index,
      coordinate: featureToLatLng(feature)
    }))
    .filter((item): item is {
      feature: ParkingFeature;
      index: number;
      coordinate: LatLng;
    } => Boolean(item.coordinate));

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroCard}>
          <Text style={styles.kicker}>Gdzie ta koperta?</Text>
          <Text style={styles.title}>Nawigacja do dostępnego postoju</Text>
          <Text style={styles.description}>
            Wpisz cel podróży. Aplikacja znajdzie miejsce docelowe, sprawdzi koperty
            w pobliżu i poprowadzi do rekomendowanej koperty.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Cel podróży</Text>
          <TextInput
            value={destinationQuery}
            onChangeText={setDestinationQuery}
            placeholder="np. Żeromskiego, Sosnowiec"
            placeholderTextColor="#6b7280"
            autoCapitalize="sentences"
            returnKeyType="search"
            onSubmitEditing={handleFindRoute}
            style={styles.input}
          />

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.buttonPressed : null
            ]}
            onPress={handleFindRoute}
          >
            <Text style={styles.primaryButtonText}>Znajdź kopertę i trasę</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed ? styles.buttonPressed : null
            ]}
            onPress={handleLoadNearbyParking}
          >
            <Text style={styles.secondaryButtonText}>Pokaż koperty w okolicy</Text>
          </Pressable>
        </View>

        <View style={styles.mapCard}>
          <MapView
            style={styles.map}
            region={mapRegion}
            showsUserLocation={locationState.status === "ready"}
            showsMyLocationButton
          >
            {userCoordinate ? (
              <Marker coordinate={userCoordinate} title="Twoja pozycja" />
            ) : null}

            {recommendedCoordinate ? (
              <Marker
                coordinate={recommendedCoordinate}
                title="Rekomendowana koperta"
                description={routeResponse?.spotDistanceToDestinationLabel || undefined}
              />
            ) : null}

            {draftCoordinate ? (
              <Marker
                coordinate={draftCoordinate}
                title={
                  draftSpot?.status === "submitted_to_osm"
                    ? "Koperta wysłana do OSM"
                    : "Nowy szkic koperty"
                }
              />
            ) : null}

            {alternativeMarkers.map(({ coordinate, feature, index }) => (
              <Marker
                key={getFeatureKey(feature, index)}
                coordinate={coordinate}
                title={`${index + 1}. ${getParkingFeatureTitle(feature)}`}
                description={formatDistanceMeters(feature.properties?.distanceMeters)}
              />
            ))}

            {routeLine.length > 1 ? (
              <Polyline coordinates={routeLine} strokeWidth={5} />
            ) : null}
          </MapView>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Status nawigacji</Text>
          <Text style={styles.statusText}>{routeState.message}</Text>

          {routeState.status === "loading" ? (
            <ActivityIndicator style={styles.loader} />
          ) : null}

          {routeState.status === "ready" && routeState.response.destination ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultTitle}>Cel</Text>
              <Text style={styles.resultText}>
                {routeState.response.destination.name}
              </Text>

              <Text style={styles.resultTitle}>Trasa</Text>
              <Text style={styles.resultText}>
                {routeState.response.routeSummary?.distanceLabel || "brak dystansu"} ·{" "}
                {routeState.response.routeSummary?.durationLabel || "brak czasu"}
              </Text>

              <Text style={styles.resultTitle}>Rekomendacja</Text>
              <Text style={styles.resultText}>
                {routeState.response.recommendedSpot
                  ? `${getParkingFeatureTitle(
                      routeState.response.recommendedSpot
                    )} · ${routeState.response.spotDistanceToDestinationLabel}`
                  : "Brak oznaczonej koperty w promieniu 5 km od celu."}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Koperty w okolicy</Text>
          <Text style={styles.statusText}>{nearbyState.message}</Text>

          {nearbyState.status === "loading" ? (
            <ActivityIndicator style={styles.loader} />
          ) : null}

          {nearbyState.status === "ready" ? (
            <View style={styles.list}>
              <Text style={styles.metaText}>
                Źródło: {nearbyState.response.metadata?.sourceStatus || "brak danych"}
              </Text>

              {nearbyState.visibleFeatures.map((feature, index) => (
                <View key={getFeatureKey(feature, index)} style={styles.listItem}>
                  <Text style={styles.listTitle}>
                    {index + 1}. {getParkingFeatureTitle(feature)}
                  </Text>
                  <Text style={styles.listMeta}>
                    {formatDistanceMeters(feature.properties?.distanceMeters)}
                    {feature.properties?.osmId
                      ? ` · OSM ${feature.properties.osmType || "node"} ${
                          feature.properties.osmId
                        }`
                      : ""}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Dodaj kopertę</Text>
          <Text style={styles.statusText}>
            Dodanie koperty tworzy lokalny szkic z aktualnej pozycji. Wysłanie do OSM
            idzie przez Vercel, zapisuje ślad w Neon i tworzy node w OpenStreetMap.
          </Text>

          {draftSpot ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultTitle}>Szkic</Text>
              <Text style={styles.resultText}>
                Lat: {draftSpot.lat.toFixed(6)} · Lng: {draftSpot.lng.toFixed(6)}
              </Text>
              <Text style={styles.resultText}>Status: {draftSpot.status}</Text>
              {draftSpot.osmUrl ? (
                <Text style={styles.resultText}>OSM: {draftSpot.osmUrl}</Text>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.statusText}>{osmMessage}</Text>

          <View style={styles.buttonRow}>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                styles.flexButton,
                pressed ? styles.buttonPressed : null
              ]}
              onPress={handleCreateDraftSpot}
            >
              <Text style={styles.secondaryButtonText}>Dodaj z mojej pozycji</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                styles.flexButton,
                pressed ? styles.buttonPressed : null
              ]}
              onPress={osmUser ? handleOsmLogout : handleOsmLogin}
              disabled={osmLoading}
            >
              <Text style={styles.secondaryButtonText}>
                {osmLoading
                  ? "Logowanie..."
                  : osmUser
                    ? "Wyloguj OSM"
                    : "Zaloguj OSM"}
              </Text>
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed || submitLoading ? styles.buttonPressed : null
            ]}
            onPress={handleSubmitDraftToOsm}
            disabled={submitLoading}
          >
            <Text style={styles.primaryButtonText}>
              {submitLoading ? "Wysyłam..." : "Wyślij kopertę do OSM"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Lokalizacja</Text>
          <Text style={styles.statusText}>{locationState.message}</Text>

          {locationState.status === "loading" ? (
            <ActivityIndicator style={styles.loader} />
          ) : null}

          {locationState.status === "ready" ? (
            <View style={styles.coords}>
              <Text style={styles.coordText}>
                Lat: {locationState.latitude.toFixed(6)}
              </Text>
              <Text style={styles.coordText}>
                Lng: {locationState.longitude.toFixed(6)}
              </Text>
              <Text style={styles.coordText}>
                Dokładność:{" "}
                {locationState.accuracy === null
                  ? "brak danych"
                  : `${Math.round(locationState.accuracy)} m`}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f4f7fb"
  },
  scrollContent: {
    padding: 16,
    gap: 14
  },
  heroCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 22,
    gap: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 18,
    gap: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3
  },
  mapCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 6,
    overflow: "hidden",
    height: 360,
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3
  },
  map: {
    flex: 1,
    borderRadius: 18
  },
  kicker: {
    fontSize: 13,
    fontWeight: "800",
    color: "#2563eb",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111827"
  },
  description: {
    fontSize: 16,
    lineHeight: 23,
    color: "#4b5563"
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827"
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: "#111827"
  },
  primaryButton: {
    backgroundColor: "#2563eb",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center"
  },
  secondaryButton: {
    backgroundColor: "#eef2ff",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: "center"
  },
  buttonPressed: {
    opacity: 0.75
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900"
  },
  secondaryButtonText: {
    color: "#1d4ed8",
    fontSize: 15,
    fontWeight: "900"
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10
  },
  flexButton: {
    flex: 1
  },
  statusText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#374151"
  },
  loader: {
    alignSelf: "flex-start",
    marginTop: 2
  },
  resultBox: {
    backgroundColor: "#eef2ff",
    borderRadius: 16,
    padding: 14,
    gap: 6
  },
  resultTitle: {
    fontSize: 12,
    color: "#3730a3",
    fontWeight: "900",
    textTransform: "uppercase"
  },
  resultText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#111827"
  },
  list: {
    gap: 8
  },
  metaText: {
    fontSize: 13,
    color: "#4b5563"
  },
  listItem: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    gap: 4
  },
  listTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#111827"
  },
  listMeta: {
    fontSize: 13,
    color: "#4b5563"
  },
  coords: {
    gap: 4
  },
  coordText: {
    fontSize: 14,
    color: "#111827",
    fontVariant: ["tabular-nums"]
  }
});