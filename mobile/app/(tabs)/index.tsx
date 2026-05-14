import * as Location from "expo-location";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import {
  fetchNearbyParking,
  formatDistanceMeters,
  getParkingFeatureTitle,
  type ParkingFeature,
  type ParkingResponse
} from "@/lib/parkingApi";

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

function getFeatureKey(feature: ParkingFeature, index: number) {
  const properties = feature.properties || {};
  const osmType = properties.osmType || "node";
  const osmId = properties.osmId;

  if (osmId !== undefined && osmId !== null) {
    return `${osmType}:${osmId}`;
  }

  return `feature:${index}`;
}

export default function HomeScreen() {
  const [locationState, setLocationState] = useState<LocationState>({
    status: "idle",
    message: "Naciśnij przycisk, żeby sprawdzić lokalizację."
  });

  const [nearbyState, setNearbyState] = useState<NearbyState>({
    status: "idle",
    message: "Koperty pojawią się po pobraniu lokalizacji."
  });

  async function loadLocationAndParking() {
    setLocationState({
      status: "loading",
      message: "Sprawdzam zgodę na lokalizację..."
    });

    setNearbyState({
      status: "idle",
      message: "Czekam na lokalizację użytkownika."
    });

    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== "granted") {
      setLocationState({
        status: "error",
        message: "Brak zgody na lokalizację. Bez niej nie wyznaczymy trasy do koperty."
      });
      return;
    }

    setLocationState({
      status: "loading",
      message: "Pobieram aktualną pozycję..."
    });

    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });

      const latitude = position.coords.latitude;
      const longitude = position.coords.longitude;

      setLocationState({
        status: "ready",
        latitude,
        longitude,
        accuracy: position.coords.accuracy,
        message: "Lokalizacja gotowa."
      });

      setNearbyState({
        status: "loading",
        message: "Pobieram koperty w promieniu 5 km..."
      });

      const response = await fetchNearbyParking({
        lat: latitude,
        lng: longitude,
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
        error instanceof Error ? error.message : "Nie udało się pobrać danych.";

      setNearbyState({
        status: "error",
        message
      });
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.kicker}>Gdzie ta koperta?</Text>
          <Text style={styles.title}>Aplikacja mobilna</Text>
          <Text style={styles.description}>
            Pobieramy Twoją lokalizację i odpytujemy istniejące API Vercel o koperty
            w promieniu 5 km.
          </Text>

          <View style={styles.statusBox}>
            <Text style={styles.statusLabel}>Lokalizacja</Text>
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

          <View style={styles.statusBox}>
            <Text style={styles.statusLabel}>Koperty z API</Text>
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

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed ? styles.buttonPressed : null
            ]}
            onPress={loadLocationAndParking}
          >
            <Text style={styles.buttonText}>Pobierz lokalizację i koperty</Text>
          </Pressable>
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
    flexGrow: 1,
    justifyContent: "center",
    padding: 20
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
    gap: 16,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4
  },
  kicker: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2563eb",
    textTransform: "uppercase",
    letterSpacing: 0.8
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#111827"
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: "#4b5563"
  },
  statusBox: {
    backgroundColor: "#eef2ff",
    borderRadius: 18,
    padding: 16,
    gap: 8
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#3730a3",
    textTransform: "uppercase"
  },
  statusText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#1f2937"
  },
  loader: {
    alignSelf: "flex-start",
    marginTop: 6
  },
  coords: {
    marginTop: 8,
    gap: 4
  },
  coordText: {
    fontSize: 14,
    color: "#111827",
    fontVariant: ["tabular-nums"]
  },
  list: {
    marginTop: 8,
    gap: 8
  },
  metaText: {
    fontSize: 13,
    color: "#4b5563"
  },
  listItem: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    gap: 4
  },
  listTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827"
  },
  listMeta: {
    fontSize: 13,
    color: "#4b5563"
  },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center"
  },
  buttonPressed: {
    opacity: 0.82
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800"
  }
});
