"use client";

import { useEffect, useRef, useState } from "react";
import { Header } from "@/components/Header";
import {
  KopertyMap,
  type RouteMapOverlay,
  type UserAddedSpot
} from "@/components/KopertyMap";
import {
  formatMeters,
  formatObjectType,
  getOsmTitle,
  type OsmParkingFeature
} from "@/lib/osmParking";

type RouteAssistantResponse = {
  ok?: boolean;
  query?: string;
  destination?: {
    name: string;
    lat: number;
    lng: number;
  };
  recommendedSpot?: OsmParkingFeature | null;
  alternatives?: OsmParkingFeature[];
  route?: RouteMapOverlay["route"];
  routeCoordinates?: RouteMapOverlay["routeCoordinates"];
  routeSummary?: {
    distanceMeters: number | null;
    durationSeconds: number | null;
    distanceLabel: string;
    durationLabel: string;
  };
    routeToSpot?: RouteMapOverlay["route"] | null;
  routeToSpotCoordinates?: RouteMapOverlay["routeCoordinates"];
  routeToSpotSummary?: {
    distanceMeters: number | null;
    durationSeconds: number | null;
    distanceLabel: string;
    durationLabel: string;
  } | null;
  routeToDestination?: RouteMapOverlay["route"] | null;
  routeToDestinationCoordinates?: RouteMapOverlay["routeCoordinates"];
  routeToDestinationSummary?: {
    distanceMeters: number | null;
    durationSeconds: number | null;
    distanceLabel: string;
    durationLabel: string;
  } | null;
  spotDistanceToDestinationMeters?: number | null;
  spotDistanceToDestinationLabel?: string;
  answer?: string;
  error?: string;
  details?: unknown;
};

type NavigationStatus = "idle" | "on_route" | "off_route" | "arrived";
type NavigationTargetMode = "spot" | "destination";

type NavigationState = {
  active: boolean;
  status: NavigationStatus;
  message: string;
  remainingMeters: number | null;
  distanceToRouteMeters: number | null;
  accuracyMeters: number | null;
};

const OFF_ROUTE_THRESHOLD_METERS = 90;
const ARRIVED_THRESHOLD_METERS = 35;
const EARTH_RADIUS_METERS = 6371000;
type GtkSpeechRecognitionAlternative = {
  transcript: string;
  confidence?: number;
};

type GtkSpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  [index: number]: GtkSpeechRecognitionAlternative;
};

type GtkSpeechRecognitionResultList = {
  length: number;
  [index: number]: GtkSpeechRecognitionResult;
};

type GtkSpeechRecognitionEvent = {
  resultIndex: number;
  results: GtkSpeechRecognitionResultList;
};

type GtkSpeechRecognitionErrorEvent = {
  error?: string;
  message?: string;
};

type GtkSpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: GtkSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: GtkSpeechRecognitionEvent) => void) | null;
};

type GtkSpeechRecognitionConstructor = new () => GtkSpeechRecognitionInstance;

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: GtkSpeechRecognitionConstructor;
  webkitSpeechRecognition?: GtkSpeechRecognitionConstructor;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number }
) {
  const dLat = toRadians(second.lat - first.lat);
  const dLng = toRadians(second.lng - first.lng);
  const lat1 = toRadians(first.lat);
  const lat2 = toRadians(second.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDegrees(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number }
) {
  const lat1 = toRadians(first.lat);
  const lat2 = toRadians(second.lat);
  const dLng = toRadians(second.lng - first.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (Math.atan2(y, x) * 180) / Math.PI + 360;
}

function normalizeBearing(value: number) {
  return ((value % 360) + 360) % 360;
}

function formatNavigationDistance(value: number | null) {
  if (!Number.isFinite(Number(value))) {
    return "brak danych";
  }

  const meters = Number(value);

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
  }

  return `${Math.round(meters)} m`;
}

function isValidLatLng(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  const speechWindow = window as WindowWithSpeechRecognition;

  return (
    speechWindow.SpeechRecognition ||
    speechWindow.webkitSpeechRecognition ||
    null
  );
}

function routeCoordinatesToLatLngs(
  route?: RouteMapOverlay["route"],
  routeCoordinates?: RouteMapOverlay["routeCoordinates"]
) {
  if (Array.isArray(routeCoordinates) && routeCoordinates.length > 0) {
    return routeCoordinates
      .map((coordinate) => {
        const lat = Number(coordinate.lat);
        const lng = Number(coordinate.lng);

        if (!isValidLatLng(lat, lng)) {
          return null;
        }

        return {
          lat,
          lng
        };
      })
      .filter((point): point is { lat: number; lng: number } => Boolean(point));
  }

  const coordinates = route?.features?.[0]?.geometry?.coordinates;

  if (!Array.isArray(coordinates)) {
    return [];
  }

  return coordinates
    .map((coordinate) => {
      const lng = Number(coordinate[0]);
      const lat = Number(coordinate[1]);

      if (!isValidLatLng(lat, lng)) {
        return null;
      }

      return {
        lat,
        lng
      };
    })
    .filter((point): point is { lat: number; lng: number } => Boolean(point));
}

function projectToMeters(
  point: { lat: number; lng: number },
  origin: { lat: number; lng: number }
) {
  const latRad = toRadians(origin.lat);

  return {
    x:
      toRadians(point.lng - origin.lng) *
      EARTH_RADIUS_METERS *
      Math.cos(latRad),
    y: toRadians(point.lat - origin.lat) * EARTH_RADIUS_METERS
  };
}

function distancePointToSegmentMeters(
  point: { lat: number; lng: number },
  segmentStart: { lat: number; lng: number },
  segmentEnd: { lat: number; lng: number }
) {
  const p = projectToMeters(point, segmentStart);
  const a = {
    x: 0,
    y: 0
  };
  const b = projectToMeters(segmentEnd, segmentStart);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= 0) {
    return distanceMeters(point, segmentStart);
  }

  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)
  );

  const projected = {
    x: a.x + t * dx,
    y: a.y + t * dy
  };

  const distanceX = p.x - projected.x;
  const distanceY = p.y - projected.y;

  return Math.sqrt(distanceX * distanceX + distanceY * distanceY);
}

function distanceToRouteMeters(
  position: { lat: number; lng: number },
  route?: RouteMapOverlay["route"],
  routeCoordinates?: RouteMapOverlay["routeCoordinates"]
) {
  const points = routeCoordinatesToLatLngs(route, routeCoordinates);

  if (points.length < 2) {
    return null;
  }

  let best = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length - 1; index += 1) {
    best = Math.min(
      best,
      distancePointToSegmentMeters(position, points[index], points[index + 1])
    );
  }

  return Number.isFinite(best) ? best : null;
}

function getFeatureLatLng(feature?: OsmParkingFeature | null) {
  const coordinates = feature?.geometry?.coordinates;

  if (!coordinates || coordinates.length < 2) {
    return null;
  }

  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);

  if (!isValidLatLng(lat, lng)) {
    return null;
  }

  return {
    lat,
    lng
  };
}

function getRouteForMode(
  result: RouteAssistantResponse | null,
  mode: NavigationTargetMode | null
) {
  if (!result || !mode) {
    return null;
  }

  if (mode === "spot") {
    return result.routeToSpot || result.route || null;
  }

  return result.routeToDestination || result.route || null;
}

function getRouteCoordinatesForMode(
  result: RouteAssistantResponse | null,
  mode: NavigationTargetMode | null
) {
  if (!result || !mode) {
    return null;
  }

  if (mode === "spot") {
    return result.routeToSpotCoordinates || result.routeCoordinates || null;
  }

  return result.routeToDestinationCoordinates || result.routeCoordinates || null;
}

function getRouteSummaryForMode(
  result: RouteAssistantResponse | null,
  mode: NavigationTargetMode | null
) {
  if (!result || !mode) {
    return null;
  }

  if (mode === "spot") {
    return result.routeToSpotSummary || result.routeSummary || null;
  }

  return result.routeToDestinationSummary || result.routeSummary || null;
}
export default function MapaPage() {
  const [assistantQuery, setAssistantQuery] = useState("");
  const [userSpots, setUserSpots] = useState<UserAddedSpot[]>([]);
  const [assistantResult, setAssistantResult] =
    useState<RouteAssistantResponse | null>(null);
  const [selectedTargetMode, setSelectedTargetMode] =
    useState<NavigationTargetMode | null>(null);
  const [routeOverlay, setRouteOverlay] = useState<RouteMapOverlay | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantPanelCollapsed, setAssistantPanelCollapsed] = useState(false);
  const [navigationState, setNavigationState] = useState<NavigationState>({
    active: false,
    status: "idle",
    message: "Nawigacja nie jest uruchomiona.",
    remainingMeters: null,
    distanceToRouteMeters: null,
    accuracyMeters: null
  });

  const navigationWatchId = useRef<number | null>(null);
  const lastNavigationPosition = useRef<{ lat: number; lng: number } | null>(null);

  const speechRecognitionRef = useRef<GtkSpeechRecognitionInstance | null>(null);

  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechListening, setSpeechListening] = useState(false);
  const [speechMessage, setSpeechMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (
        typeof navigator !== "undefined" &&
        navigator.geolocation &&
        navigationWatchId.current !== null
      ) {
        navigator.geolocation.clearWatch(navigationWatchId.current);
        navigationWatchId.current = null;
      }
    };
  }, []);

  useEffect(() => {
  setSpeechSupported(Boolean(getSpeechRecognitionConstructor()));

  return () => {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.abort();
      speechRecognitionRef.current = null;
    }
  };
}, []);

function stopVoiceInput() {
  if (speechRecognitionRef.current) {
    speechRecognitionRef.current.stop();
    speechRecognitionRef.current = null;
  }

  setSpeechListening(false);
}

function startVoiceInput() {
  const SpeechRecognition = getSpeechRecognitionConstructor();

  if (!SpeechRecognition) {
    setSpeechSupported(false);
    setSpeechMessage(
      "Ta przeglądarka nie obsługuje rozpoznawania mowy. Wpisz cel ręcznie."
    );
    return;
  }

  if (speechListening) {
    stopVoiceInput();
    return;
  }

  const recognition = new SpeechRecognition();

  recognition.lang = "pl-PL";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    setSpeechListening(true);
    setSpeechMessage("Słucham. Powiedz cel podróży.");
  };

  recognition.onend = () => {
    setSpeechListening(false);
    speechRecognitionRef.current = null;
  };

  recognition.onerror = (event) => {
    setSpeechListening(false);
    speechRecognitionRef.current = null;

    if (event.error === "not-allowed") {
      setSpeechMessage(
        "Brak zgody na mikrofon. Włącz zgodę w przeglądarce albo wpisz cel ręcznie."
      );
      return;
    }

    setSpeechMessage("Nie udało się rozpoznać mowy. Spróbuj ponownie.");
  };

  recognition.onresult = (event) => {
    let transcript = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const alternative = result[0];

      if (alternative?.transcript) {
        transcript += alternative.transcript;
      }
    }

    const cleanTranscript = transcript.trim();

    if (cleanTranscript) {
      setAssistantQuery(cleanTranscript);
      setSpeechMessage(`Rozpoznano: ${cleanTranscript}`);
    }
  };

  speechRecognitionRef.current = recognition;

  try {
    recognition.start();
  } catch {
    speechRecognitionRef.current = null;
    setSpeechListening(false);
    setSpeechMessage("Nie udało się uruchomić mikrofonu.");
  }
}

  function getCurrentPosition() {
    return new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Ta przeglądarka nie obsługuje geolokalizacji."));
        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 20000
      });
    });
  }

  function selectNavigationTarget(mode: NavigationTargetMode) {
  if (!assistantResult) {
    return;
  }

  if (mode === "spot" && !assistantResult.recommendedSpot) {
    setAssistantError("Brak rekomendowanej koperty przy tym celu.");
    return;
  }

  if (navigator.geolocation && navigationWatchId.current !== null) {
    navigator.geolocation.clearWatch(navigationWatchId.current);
    navigationWatchId.current = null;
  }

  setAssistantError(null);
  setSelectedTargetMode(mode);
  setAssistantPanelCollapsed(false);

  const route = getRouteForMode(assistantResult, mode);
  const routeCoordinates = getRouteCoordinatesForMode(assistantResult, mode);

  setRouteOverlay({
    route,
    routeCoordinates,
    destination: assistantResult.destination || null,
    recommendedSpot: assistantResult.recommendedSpot || null,
    fitMode: "route"
  });

  setNavigationState({
    active: false,
    status: "idle",
    message:
      mode === "spot"
        ? "Wybrano prowadzenie do koperty. Możesz uruchomić nawigację."
        : "Wybrano prowadzenie pod wskazany adres. Możesz uruchomić nawigację.",
    remainingMeters: null,
    distanceToRouteMeters: null,
    accuracyMeters: null
  });
}

function getNavigationTarget(result = assistantResult) {
  if (!result || !selectedTargetMode) {
    return null;
  }

  if (selectedTargetMode === "spot") {
    return getFeatureLatLng(result.recommendedSpot);
  }

  if (selectedTargetMode === "destination" && result.destination) {
    return {
      lat: result.destination.lat,
      lng: result.destination.lng
    };
  }

  return null;
}

  function updateNavigationFromPosition(position: GeolocationPosition) {
    if (!assistantResult) {
      return;
    }

   const basePosition = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };

    const headingDegrees = getHeadingDegrees(
      basePosition,
      typeof position.coords.heading === "number" ? position.coords.heading : null
    );

    const currentPosition = {
      ...basePosition,
      accuracyMeters: Number.isFinite(position.coords.accuracy)
        ? position.coords.accuracy
        : null,
      headingDegrees
    };

    lastNavigationPosition.current = basePosition;

    const target = getNavigationTarget(assistantResult);
    const remainingMeters = target
      ? distanceMeters(currentPosition, target)
      : null;

    const activeRoute = getRouteForMode(assistantResult, selectedTargetMode);
    const activeRouteCoordinates = getRouteCoordinatesForMode(
      assistantResult,
      selectedTargetMode
    );

    const routeDistanceMeters = distanceToRouteMeters(
      currentPosition,
      activeRoute,
      activeRouteCoordinates
    );

    let status: NavigationStatus = "on_route";
    let message = "Prowadzę do rekomendowanego miejsca postoju.";

    if (remainingMeters !== null && remainingMeters <= ARRIVED_THRESHOLD_METERS) {
      status = "arrived";
      message = "Jesteś przy rekomendowanej kopercie.";
    } else if (
      routeDistanceMeters !== null &&
      routeDistanceMeters > OFF_ROUTE_THRESHOLD_METERS
    ) {
      status = "off_route";
      message = "Jesteś poza trasą. Przelicz trasę z aktualnej pozycji.";
    }

    setNavigationState({
      active: true,
      status,
      message,
      remainingMeters,
      distanceToRouteMeters: routeDistanceMeters,
      accuracyMeters: currentPosition.accuracyMeters
    });

   setRouteOverlay({
      route: activeRoute,
      routeCoordinates: activeRouteCoordinates,
      destination: assistantResult.destination || null,
      recommendedSpot: assistantResult.recommendedSpot || null,
      currentPosition,
      routeStatus: status,
      fitMode: "follow"
    });
  }

  function getHeadingDegrees(
  currentPosition: { lat: number; lng: number },
  nativeHeading: number | null
) {
  if (
    typeof nativeHeading === "number" &&
    Number.isFinite(nativeHeading) &&
    nativeHeading >= 0
  ) {
    return normalizeBearing(nativeHeading);
  }

  const previousPosition = lastNavigationPosition.current;

  if (!previousPosition) {
    return null;
  }

  const movedMeters = distanceMeters(previousPosition, currentPosition);

  if (movedMeters < 3) {
    return null;
  }

  return normalizeBearing(bearingDegrees(previousPosition, currentPosition));
}

  function stopNavigation() {
    if (navigator.geolocation && navigationWatchId.current !== null) {
      navigator.geolocation.clearWatch(navigationWatchId.current);
      navigationWatchId.current = null;
    }
    lastNavigationPosition.current = null;

    setNavigationState((current) => ({
      ...current,
      active: false,
      status: "idle",
      message: "Nawigacja została zatrzymana."
    }));
    setAssistantPanelCollapsed(false);

   if (assistantResult) {
      setRouteOverlay({
        route: getRouteForMode(assistantResult, selectedTargetMode),
        routeCoordinates: getRouteCoordinatesForMode(
          assistantResult,
          selectedTargetMode
        ),
        destination: assistantResult.destination || null,
        recommendedSpot: assistantResult.recommendedSpot || null,
        fitMode: "route"
      });
    }
  }

  async function startNavigation() {
    if (!assistantResult) {
      setAssistantError("Najpierw wyznacz trasę.");
      return;
    }

    if (!selectedTargetMode) {
      setAssistantError("Wybierz, czy prowadzić do koperty, czy pod wskazany adres.");
      return;
    }

    if (selectedTargetMode === "spot" && !assistantResult.recommendedSpot) {
      setAssistantError("Brak rekomendowanej koperty, do której można prowadzić.");
      return;
    }

    if (!navigator.geolocation) {
      setAssistantError("Ta przeglądarka nie obsługuje geolokalizacji.");
      return;
    }

    if (navigationWatchId.current !== null) {
      navigator.geolocation.clearWatch(navigationWatchId.current);
      navigationWatchId.current = null;
    }

    setAssistantError(null);

    try {
      const firstPosition = await getCurrentPosition();
      updateNavigationFromPosition(firstPosition);
      setAssistantPanelCollapsed(true);

    navigationWatchId.current = navigator.geolocation.watchPosition(
      updateNavigationFromPosition,
      () => {
        setAssistantError(
          "Nie mogę odświeżyć lokalizacji. Sprawdź zgodę przeglądarki."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nie udało się uruchomić nawigacji.";

      setAssistantError(message);
    }
  }

  async function submitRouteAssistant() {
    const query = assistantQuery.trim();

    if (!query) {
      setAssistantError("Wpisz cel podróży.");
      return;
    }

    stopNavigation();
    stopVoiceInput();
    setAssistantPanelCollapsed(false);

    setAssistantLoading(true);
    setAssistantError(null);
    setAssistantResult(null);
    setRouteOverlay(null);
    setSelectedTargetMode(null);

    try {
      const position = await getCurrentPosition();

      const response = await fetch("/api/route-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query,
          userLat: position.coords.latitude,
          userLng: position.coords.longitude,
          localSpots: userSpots.map((spot) => ({
            id: spot.id,
            lat: spot.lat,
            lng: spot.lng,
            status: spot.status,
            osmUrl: spot.osmUrl || null,
            osmNodeId: spot.osmNodeId || null,
            addedByName: spot.addedByName || null
          }))
        })
      });

      const data = (await response.json()) as RouteAssistantResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Nie udało się wyznaczyć trasy.");
      }

      setAssistantResult(data);

    if (data.recommendedSpot) {
      setRouteOverlay({
        route: null,
        routeCoordinates: null,
        destination: data.destination || null,
        recommendedSpot: data.recommendedSpot || null,
        fitMode: "route"
      });
    } else {
      setSelectedTargetMode("destination");

      setRouteOverlay({
        route: data.routeToDestination || data.route || null,
        routeCoordinates:
          data.routeToDestinationCoordinates || data.routeCoordinates || null,
        destination: data.destination || null,
        recommendedSpot: null,
        fitMode: "route"
      });
    }

      setNavigationState({
        active: false,
        status: "idle",
        message: data.recommendedSpot
        ? "Wybierz, czy prowadzić do koperty, czy pod wskazany adres."
        : "Trasa pod wskazany adres jest gotowa.",
        remainingMeters: null,
        distanceToRouteMeters: null,
        accuracyMeters: null
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nieznany błąd asystenta dojazdu.";

      setAssistantError(message);
      setRouteOverlay(null);
    } finally {
      setAssistantLoading(false);
    }
  }

  const recommendedProperties = assistantResult?.recommendedSpot?.properties;

  const selectedRouteSummary = getRouteSummaryForMode(
    assistantResult,
    selectedTargetMode
  );

  const destinationRouteSummary =
    assistantResult?.routeToDestinationSummary || assistantResult?.routeSummary;

  const spotRouteSummary =
    assistantResult?.routeToSpotSummary || assistantResult?.routeSummary;

  return (
    <main className="page-shell page-shell-navigation">
      <Header />

      <section className="navigation-map-section" aria-label="Mapa nawigacji">
        <div className="navigation-map-card">
        <KopertyMap
            full
            routeOverlay={routeOverlay}
            useViewportRadius
            showRadiusControl={false}
            hideStatusChips
            navigationControl={
              assistantResult && (assistantPanelCollapsed || navigationState.active)
                ? {
                    active: true,
                    remainingLabel: navigationState.active
                      ? formatNavigationDistance(navigationState.remainingMeters)
                      : assistantResult.routeSummary?.distanceLabel,
                    statusLabel: navigationState.active
                      ? navigationState.message
                      : "Pokaż panel asystenta dojazdu",
                    showStop: navigationState.active,
                    onOpen: () => setAssistantPanelCollapsed(false),
                    onStop: stopNavigation
                  }
                : null
            }
          />

           <div
              className={`route-assistant-mapbar ${
                assistantResult ? "route-assistant-mapbar-expanded" : ""
              } ${assistantPanelCollapsed ? "route-assistant-mapbar-collapsed" : ""}`}
            >
            <form
              className="route-assistant-mapbar-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submitRouteAssistant();
              }}
            >
              <label htmlFor="route-assistant-query">Cel podróży</label>

              <div className="route-assistant-mapbar-row">
              <div className="route-assistant-mapbar-input-wrap">
                <input
                  id="route-assistant-query"
                  value={assistantQuery}
                  onChange={(event) => {
                    setAssistantQuery(event.target.value);
                    setSpeechMessage(null);
                  }}
                  placeholder="Dokąd jedziesz?"
                  type="text"
                />

                <button
                  type="button"
                  className={`route-assistant-mic-button ${
                    speechListening ? "route-assistant-mic-button-active" : ""
                  }`}
                  onClick={speechListening ? stopVoiceInput : startVoiceInput}
                  disabled={!speechSupported || assistantLoading}
                  aria-label={
                    speechListening
                      ? "Zatrzymaj rozpoznawanie mowy"
                      : "Powiedz cel podróży"
                  }
                  title={
                    speechSupported
                      ? "Powiedz cel podróży"
                      : "Ta przeglądarka nie obsługuje rozpoznawania mowy"
                  }
                >
                  {speechListening ? "■" : "🎙"}
                </button>
              </div>

              <button
                type="submit"
                className="route-assistant-mapbar-submit"
                disabled={assistantLoading}
              >
                {assistantLoading ? "Szukam…" : "Pokaż"}
              </button>
            </div>
            </form>

            {speechMessage ? (
            <div
              className={`route-assistant-voice-hint ${
                speechListening ? "route-assistant-voice-hint-active" : ""
              }`}
            >
              {speechMessage}
            </div>
          ) : null}

            {assistantError ? (
              <div className="route-assistant-mapbar-error">
                {assistantError}
              </div>
            ) : null}

            {assistantResult ? (
              <div className="route-assistant-mapbar-result">
                <div className="route-assistant-mapbar-result-top">
                  <div>
                    <span>Rekomendacja</span>
                    <strong>
                      {assistantResult.recommendedSpot
                        ? "Prowadzenie do koperty"
                        : "Trasa do celu"}
                    </strong>
                  </div>

                  <div className="route-assistant-mapbar-result-actions">
                    {selectedRouteSummary ? (
                  <div className="route-assistant-mapbar-summary">
                    <span>{selectedRouteSummary.durationLabel}</span>
                    <strong>{selectedRouteSummary.distanceLabel}</strong>
                  </div>
                ) : null}

                 <button
                    type="button"
                    className="route-assistant-mapbar-collapse"
                    onClick={() => setAssistantPanelCollapsed(true)}
                  >
                    Zwiń
                  </button>
                  </div>
                </div>

                {assistantResult.answer ? (
                  <p>{assistantResult.answer}</p>
                ) : null}

              <div className="route-target-choice">
                {assistantResult.recommendedSpot ? (
                  <button
                    type="button"
                    className={`route-target-choice-button ${
                      selectedTargetMode === "spot" ? "route-target-choice-button-active" : ""
                    }`}
                    onClick={() => selectNavigationTarget("spot")}
                  >
                    <span>Nawiguj do koperty</span>
                    <strong>
                      {assistantResult.spotDistanceToDestinationLabel
                        ? `Koperta ${assistantResult.spotDistanceToDestinationLabel} od celu`
                        : "Najbliższe miejsce postoju"}
                    </strong>
                    {spotRouteSummary ? (
                      <small>
                        {spotRouteSummary.durationLabel} · {spotRouteSummary.distanceLabel}
                      </small>
                    ) : null}
                  </button>
                ) : null}

                <button
                  type="button"
                  className={`route-target-choice-button ${
                    selectedTargetMode === "destination"
                      ? "route-target-choice-button-active"
                      : ""
                  }`}
                  onClick={() => selectNavigationTarget("destination")}
                >
                  <span>Nawiguj pod adres</span>
                  <strong>Jedź bezpośrednio do celu</strong>
                  {destinationRouteSummary ? (
                    <small>
                      {destinationRouteSummary.durationLabel} ·{" "}
                      {destinationRouteSummary.distanceLabel}
                    </small>
                  ) : null}
                </button>
              </div>

                <div className="route-navigation-panel route-navigation-panel-compact">
                  <strong>Prowadzenie</strong>
                  <p>{navigationState.message}</p>

                  <div className="route-assistant-meta">
                    <span>
                      Do koperty:{" "}
                      {formatNavigationDistance(navigationState.remainingMeters)}
                    </span>
                    <span>
                      Od trasy:{" "}
                      {formatNavigationDistance(
                        navigationState.distanceToRouteMeters
                      )}
                    </span>
                  </div>

                  <div className="route-navigation-actions">
                    {!navigationState.active ? (
                      <button
                        type="button"
                        className="route-navigation-primary"
                        onClick={() => void startNavigation()}
                        disabled={!assistantResult.recommendedSpot}
                      >
                        Nawiguj
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="route-navigation-secondary"
                        onClick={stopNavigation}
                      >
                        Stop
                      </button>
                    )}

                    {navigationState.status === "off_route" ? (
                      <button
                        type="button"
                        className="route-navigation-secondary"
                        onClick={() => void submitRouteAssistant()}
                      >
                        Przelicz
                      </button>
                    ) : null}
                  </div>
                </div>

                {recommendedProperties ? (
                  <article className="route-assistant-mapbar-spot">
                    <div>
                      <span>Rekomendowane miejsce</span>
                      <strong>{getOsmTitle(recommendedProperties)}</strong>
                      <small>
                        {formatObjectType(recommendedProperties.objectType)}
                      </small>
                    </div>

                    <div className="route-assistant-mapbar-spot-meta">
                      <span>{formatMeters(recommendedProperties.distanceMeters)}</span>
                      <span>
                        nawierzchnia:{" "}
                        {recommendedProperties.surface || "brak danych"}
                      </span>
                      <span>
                        dostęp: {recommendedProperties.access || "brak danych"}
                      </span>
                    </div>

                    {recommendedProperties.osmUrl ? (
                      <a
                        href={recommendedProperties.osmUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        OSM
                      </a>
                    ) : null}
                  </article>
                ) : null}
              </div>
            ) : null}

            <div
              className="route-assistant-attribution route-assistant-attribution-mapbar"
              aria-label="Atrybucja routingu i danych mapowych"
            >
              <span>
                Trasy:{" "}
                <a
                  href="https://openrouteservice.org/"
                  target="_blank"
                  rel="noreferrer"
                >
                  © openrouteservice.org by HeiGIT
                </a>
              </span>
              <span>
                Dane mapy:{" "}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                >
                  © OpenStreetMap contributors
                </a>
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}