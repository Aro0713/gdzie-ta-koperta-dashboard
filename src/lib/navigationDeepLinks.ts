export type NavigationProvider = "google" | "apple" | "yanosik" | "waze" | "geo";

export interface NavigationLinkOptions {
  lat: number;
  lng: number;
  label?: string;
}

export interface NavigationAppOption {
  id: NavigationProvider;
  name: string;
  icon: string;
  badge?: string;
  url: string;
  fallbackUrl?: string;
}

export function getNavigationApps({ lat, lng, label = "Koperta" }: NavigationLinkOptions): NavigationAppOption[] {
  const encodedLabel = encodeURIComponent(label);
  
  return [
    {
      id: "google",
      name: "Google Maps",
      icon: "🗺️",
      badge: "Najpopularniejsza",
      url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
    },
    {
      id: "apple",
      name: "Apple Maps",
      icon: "🍎",
      badge: "iOS / CarPlay",
      url: `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d&t=m&q=${encodedLabel}`,
    },
    {
      id: "yanosik",
      name: "Yanosik",
      icon: "🚗",
      badge: "Fotoradary i korki PL",
      url: `yanosik://navigate?lat=${lat}&lon=${lng}`,
      fallbackUrl: `https://yanosik.pl/`,
    },
    {
      id: "waze",
      name: "Waze",
      icon: "⚡",
      badge: "Zgłoszenia na żywo",
      url: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
    },
    {
      id: "geo",
      name: "Domyślna nawigacja",
      icon: "📍",
      badge: "Systemowa",
      url: `geo:${lat},${lng}?q=${lat},${lng}(${encodedLabel})`,
    }
  ];
}
