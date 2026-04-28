export type SpotStatus =
  | "confirmed"
  | "needs_verification"
  | "reported_problem";

export type KopertaSpot = {
  id: string;
  name: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  slots: number;
  status: SpotStatus;
  confidence: number;
  lastVerified: string;
  distanceLabel: string;
  tags: string[];
};

export const demoSpots: KopertaSpot[] = [
  {
    id: "warszawa-centrum-01",
    name: "Koperta przy wejściu do urzędu",
    city: "Warszawa",
    address: "okolice pl. Bankowego",
    lat: 52.2442,
    lng: 21.0026,
    slots: 2,
    status: "confirmed",
    confidence: 0.94,
    lastVerified: "dzisiaj",
    distanceLabel: "240 m",
    tags: ["potwierdzona", "blisko wejścia", "2 miejsca"]
  },
  {
    id: "warszawa-centrum-02",
    name: "Miejsce przy przychodni",
    city: "Warszawa",
    address: "ul. Świętokrzyska",
    lat: 52.2357,
    lng: 21.0107,
    slots: 1,
    status: "needs_verification",
    confidence: 0.61,
    lastVerified: "3 miesiące temu",
    distanceLabel: "610 m",
    tags: ["do weryfikacji", "przychodnia"]
  },
  {
    id: "warszawa-centrum-03",
    name: "Koperta z problemem oznakowania",
    city: "Warszawa",
    address: "okolice Powiśla",
    lat: 52.2419,
    lng: 21.0277,
    slots: 1,
    status: "reported_problem",
    confidence: 0.48,
    lastVerified: "wczoraj",
    distanceLabel: "1,2 km",
    tags: ["zgłoszony problem", "słabe oznakowanie"]
  }
];

export const statusLabels: Record<SpotStatus, string> = {
  confirmed: "Potwierdzona",
  needs_verification: "Do weryfikacji",
  reported_problem: "Problem"
};

export const statusDescriptions: Record<SpotStatus, string> = {
  confirmed: "Społeczność potwierdziła, że miejsce istnieje i jest dostępne.",
  needs_verification: "Miejsce wymaga ponownego sprawdzenia w terenie.",
  reported_problem: "Użytkownicy zgłosili problem z oznakowaniem lub dostępnością."
};
