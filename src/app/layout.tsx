import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { CookieConsent } from "@/components/CookieConsent";
import { GlobalPullToRefresh } from "@/components/GlobalPullToRefresh";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Gdzie ta koperta? - Społeczna mapa dostępności",
  description: "Społeczna mapa miejsc parkingowych dla osób z niepełnosprawnościami.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GdzieTaKoperta",
  },
  icons: {
    icon: "/koperta-profile.jpg",
    apple: "/koperta-profile.jpg",
  },
};

export default function RootLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pl">
      <body className="antialiased selection:bg-sky-500 selection:text-white">
        <GlobalPullToRefresh />
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
